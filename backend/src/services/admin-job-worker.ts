/**
 * Admin job worker: processes one job at a time from the DB queue.
 * Runs syllabus-extract, study-notes-extract, curation-import, study-notes-generate,
 * merge-revision-node-ids, question-bank-generate, merge-questions-node-ids.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getPool } from '../db.js';
import { getJobQueue } from './job-queue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '../..');
const ROOT = path.resolve(BACKEND_DIR, '..');

function runCommand(
  cmd: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv }
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env,
      shell: process.platform === 'win32',
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

async function isStructurePublishedForChapter(chapterId: string): Promise<boolean> {
  const pool = getPool();
  const res = await pool.query<{ id: string }>(
    `SELECT id FROM curation_items WHERE chapter_id = $1 AND content_type = 'structure' AND status = 'published'`,
    [chapterId]
  );
  return res.rows.length > 0;
}

async function getChapterMeta(chapterId: string): Promise<{ sequence_number: number; discipline: string | null } | null> {
  const pool = getPool();
  const res = await pool.query<{ sequence_number: number; discipline: string | null }>(
    'SELECT sequence_number, discipline FROM chapters WHERE id = $1',
    [chapterId]
  );
  if (res.rows.length === 0) return null;
  return res.rows[0];
}


type ProgressFn = (pct: number, message?: string) => void;

async function runGenerateStructure(
  payload: { book_slug: string; chapter_numbers?: number[] },
  log: string[],
  progress: ProgressFn
): Promise<Record<string, unknown>> {
  const { book_slug, chapter_numbers } = payload;
  const syllabusOut = path.join(ROOT, 'scripts', 'syllabus-extract', 'out');
  const notesOut = path.join(ROOT, 'scripts', 'study-notes-extract', 'out');
  const env = { ...process.env };

  progress(5, 'Starting syllabus extract...');
  const syllabusScript = path.join(ROOT, 'scripts', 'syllabus-extract', 'extract.mjs');
  const syllabusArgs = [syllabusScript, '--book=' + book_slug];
  if (chapter_numbers?.length) {
    for (const n of chapter_numbers) syllabusArgs.push('--chapter=' + n);
  }
  log.push('Running syllabus-extract...');
  const s1 = await runCommand('node', syllabusArgs, { cwd: ROOT, env });
  log.push(s1.stdout);
  if (s1.stderr) log.push('stderr: ' + s1.stderr);
  if (s1.code !== 0) throw new Error('syllabus-extract failed with code ' + s1.code);
  progress(35, 'Syllabus extract done. Running study-notes extract...');

  const notesScript = path.join(ROOT, 'scripts', 'study-notes-extract', 'extract-study-notes.mjs');
  const notesArgs = [notesScript, '--book=' + book_slug];
  if (chapter_numbers?.length) {
    for (const n of chapter_numbers) notesArgs.push('--chapter=' + n);
  }
  log.push('Running study-notes-extract...');
  const s2 = await runCommand('node', notesArgs, { cwd: ROOT, env });
  log.push(s2.stdout);
  if (s2.stderr) log.push('stderr: ' + s2.stderr);
  if (s2.code !== 0) throw new Error('study-notes-extract failed with code ' + s2.code);
  progress(65, 'Study-notes extract done. Running curation import...');

  log.push('Running curation-import...');
  const syllabusDir = path.join(ROOT, 'scripts', 'syllabus-extract', 'out');
  const notesDir = path.join(ROOT, 'scripts', 'study-notes-extract', 'out');
  const s3 = await runCommand('npx', ['tsx', 'scripts/curation-import.ts', syllabusDir, notesDir], {
    cwd: BACKEND_DIR,
    env,
  });
  log.push(s3.stdout);
  if (s3.stderr) log.push('stderr: ' + s3.stderr);
  if (s3.code !== 0) throw new Error('curation-import failed with code ' + s3.code);
  progress(95, 'Curation import done.');

  return { syllabus_out: syllabusOut, notes_out: notesOut };
}

async function runGenerateRevisionNotes(
  payload: { chapter_id: string },
  log: string[],
  progress: ProgressFn
): Promise<Record<string, unknown>> {
  const { chapter_id } = payload;
  const published = await isStructurePublishedForChapter(chapter_id);
  if (!published) throw new Error('Publish structure first for this chapter.');

  const meta = await getChapterMeta(chapter_id);
  if (!meta) throw new Error('Chapter not found: ' + chapter_id);

  progress(5, 'Running study-notes-generate...');
  const env = { ...process.env };
  const genOut = path.join(ROOT, 'scripts', 'study-notes-generate', 'out');
  if (!fs.existsSync(genOut)) fs.mkdirSync(genOut, { recursive: true });

  const genScript = path.join(ROOT, 'scripts', 'study-notes-generate', 'generate-study-notes.mjs');
  const genArgs = [genScript, '--from-db', '--chapter-id=' + chapter_id];
  log.push('Running study-notes-generate --from-db...');
  const s1 = await runCommand('node', genArgs, { cwd: ROOT, env });
  log.push(s1.stdout);
  if (s1.stderr) log.push('stderr: ' + s1.stderr);
  if (s1.code !== 0) throw new Error('study-notes-generate failed with code ' + s1.code);
  progress(40, 'Generating revision notes done. Merging node IDs...');

  const files = fs.readdirSync(genOut).filter((f) => f.startsWith('study_notes_') && f.endsWith('.json'));
  if (files.length === 0) throw new Error('No study_notes_*.json produced.');
  const notesPath = path.join(genOut, files[0]);
  const mergeRevScript = path.join(BACKEND_DIR, 'scripts', 'merge-revision-notes-node-ids.ts');
  log.push('Running curation:merge-revision-node-ids...');
  const s2 = await runCommand('npx', ['tsx', mergeRevScript, chapter_id, notesPath], {
    cwd: BACKEND_DIR,
    env,
  });
  log.push(s2.stdout);
  if (s2.stderr) log.push('stderr: ' + s2.stderr);
  if (s2.code !== 0) throw new Error('merge-revision-node-ids failed with code ' + s2.code);
  progress(70, 'Merge done. Importing revision notes...');

  log.push('Running curation-import --notes-only...');
  const s3 = await runCommand('npx', ['tsx', 'scripts/curation-import.ts', '--notes-only', genOut], {
    cwd: BACKEND_DIR,
    env,
  });
  log.push(s3.stdout);
  if (s3.stderr) log.push('stderr: ' + s3.stderr);
  if (s3.code !== 0) throw new Error('curation-import (notes-only) failed with code ' + s3.code);
  progress(95, 'Import done.');

  return { chapter_id, notes_file: notesPath };
}

async function runGenerateQuestionBank(
  payload: { chapter_id: string },
  log: string[],
  progress: ProgressFn
): Promise<Record<string, unknown>> {
  const { chapter_id } = payload;
  const published = await isStructurePublishedForChapter(chapter_id);
  if (!published) throw new Error('Publish structure first for this chapter.');

  const meta = await getChapterMeta(chapter_id);
  if (!meta) throw new Error('Chapter not found: ' + chapter_id);
  const ch = String(meta.sequence_number).padStart(2, '0');
  const discipline = meta.discipline || 'history';
  const expectedBasename = `sample_questions_Ch${ch}_${discipline}.json`;

  const env = { ...process.env };
  const qbOut = path.join(ROOT, 'scripts', 'question-bank-generate', 'out');
  if (!fs.existsSync(qbOut)) fs.mkdirSync(qbOut, { recursive: true });

  const existingPath = path.join(qbOut, expectedBasename);
  if (fs.existsSync(existingPath)) {
    fs.unlinkSync(existingPath);
    log.push('Removed existing ' + expectedBasename + ' so this run produces a single chapter file.');
  }

  progress(5, 'Running question-bank-generate...');
  const qbScript = path.join(ROOT, 'scripts', 'question-bank-generate', 'generate-question-bank.mjs');
  const qbArgs = [qbScript, '--from-db', '--chapter-id=' + chapter_id];
  log.push('Running question-bank-generate --from-db...');
  const s1 = await runCommand('node', qbArgs, { cwd: ROOT, env });
  log.push(s1.stdout);
  if (s1.stderr) log.push('stderr: ' + s1.stderr);
  if (s1.code !== 0) throw new Error('question-bank-generate failed with code ' + s1.code);
  progress(35, 'Question bank generated. Merging node IDs...');

  const questionsPath = path.join(qbOut, expectedBasename);
  if (!fs.existsSync(questionsPath)) {
    const files = fs.readdirSync(qbOut).filter((f) => f.startsWith('sample_questions_') && f.endsWith('.json'));
    throw new Error(
      'Expected ' + expectedBasename + ' after generate; not found. Got: ' + (files.length ? files.join(', ') : 'none')
    );
  }
  const mergeQScript = path.join(BACKEND_DIR, 'scripts', 'merge-questions-node-ids.ts');
  log.push('Running curation:merge-questions-node-ids...');
  const s2 = await runCommand('npx', ['tsx', mergeQScript, chapter_id, questionsPath], {
    cwd: BACKEND_DIR,
    env,
  });
  log.push(s2.stdout);
  if (s2.stderr) log.push('stderr: ' + s2.stderr);
  if (s2.code !== 0) throw new Error('merge-questions-node-ids failed with code ' + s2.code);
  progress(65, 'Merge done. Importing questions (this chapter only)...');

  const tmpDir = path.join(qbOut, '.import-' + chapter_id.replace(/-/g, ''));
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    fs.copyFileSync(questionsPath, path.join(tmpDir, expectedBasename));
    const importScript = path.join(BACKEND_DIR, 'scripts', 'curation-import.ts');
    log.push('Running curation-import --questions-only (single chapter)...');
    const s3 = await runCommand('npx', ['tsx', importScript, '--questions-only', tmpDir], {
      cwd: BACKEND_DIR,
      env,
    });
    log.push(s3.stdout);
    if (s3.stderr) log.push('stderr: ' + s3.stderr);
    if (s3.code !== 0) throw new Error('curation-import (questions-only) failed with code ' + s3.code);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch (_) {}
  }
  progress(95, 'Import done.');

  return { chapter_id, questions_file: questionsPath };
}

async function runUploadChapter(
  _payload: Record<string, unknown>,
  log: string[],
  _progress: ProgressFn
): Promise<Record<string, unknown>> {
  log.push('XLSX+ZIP upload ingest is not yet implemented.');
  throw new Error('Upload chapter (XLSX+ZIP) ingest not implemented. Use Generate Structure or add implementation.');
}

const ETA_MINUTES: Record<string, number> = {
  generate_structure: 8,
  generate_revision_notes: 3,
  generate_question_bank: 15,
  upload_chapter: 1,
};

async function processJob(jobId: string): Promise<void> {
  const queue = getJobQueue();
  const job = await queue.getJob(jobId);
  if (!job || job.status !== 'queued') return;

  const running = await queue.listJobs({ status: 'running', limit: 1 });
  if (running.length > 0 && running[0].id !== jobId) return;

  await queue.setRunning(jobId);
  const etaMinutes = ETA_MINUTES[job.job_type] ?? 5;
  await queue.setEstimatedFinishedAt(jobId, new Date(Date.now() + etaMinutes * 60 * 1000));

  const log: string[] = [];
  const progress: ProgressFn = (pct, message) => {
    queue.setProgress(jobId, pct, message).catch((err) => {
      console.error('[admin-job-worker] setProgress failed:', err);
    });
  };

  try {
    let result: Record<string, unknown>;
    switch (job.job_type) {
      case 'generate_structure':
        result = await runGenerateStructure(
          job.payload as { book_slug: string; chapter_numbers?: number[] },
          log,
          progress
        );
        break;
      case 'generate_revision_notes':
        result = await runGenerateRevisionNotes(job.payload as { chapter_id: string }, log, progress);
        break;
      case 'generate_question_bank':
        result = await runGenerateQuestionBank(job.payload as { chapter_id: string }, log, progress);
        break;
      case 'upload_chapter':
        result = await runUploadChapter(job.payload, log, progress);
        break;
      default:
        throw new Error('Unknown job type: ' + job.job_type);
    }
    await queue.setCompleted(jobId, result, log.join('\n'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await queue.setFailed(jobId, msg, log.join('\n'));
  }
}

function poll(): void {
  const queue = getJobQueue();
  queue.getNextQueued().then((job) => {
    if (job) processJob(job.id).finally(() => poll());
    else setTimeout(poll, 3000);
  });
}

export function startAdminJobWorker(): void {
  const queue = getJobQueue();
  queue.resetStaleRunningJobs().then((n) => {
    if (n > 0) console.log('[admin-job-worker] Reset', n, 'stale running job(s) to queued');
  });
  setTimeout(poll, 2000);
}
