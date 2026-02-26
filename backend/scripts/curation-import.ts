#!/usr/bin/env node
/**
 * Import to Curation: read syllabus + notes JSON from path → draft_syllabus_nodes,
 * draft_note_blocks, curation_items. Run after syllabus-extract and study-notes-extract (or study-notes-generate).
 * Run from backend/: npm run curation:import [syllabus-dir] [notes-dir] [questions-dir]
 * Default dirs: ../scripts/syllabus-extract/out, ../scripts/study-notes-extract/out, ../scripts/question-extract-sample/out
 * Notes: reads notes_*.json (extract format) and study_notes_*.json (generate format). For same chapter, study_notes overwrites.
 * Questions: reads sample_questions_*.json; subject/chapter must exist (run syllabus import first).
 *
 * --notes-only: skip syllabus and questions; only import notes from notes-dir.
 *   Example: npm run curation:import -- --notes-only ../scripts/study-notes-generate/out
 * --questions-only: skip syllabus and notes; only import questions from questions-dir. Chapters must already exist.
 *   Example: npm run curation:import -- --questions-only ../scripts/question-bank-generate/out
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import { getPool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

type NodeJson = {
  title: string;
  sequence_number: number;
  depth?: number;
  level_label?: string;
  children?: NodeJson[];
  content_blocks?: Array<{ content_md?: string }>;
};

type SyllabusJson = {
  board: string;
  grade: number;
  subject: string;
  book_meta: { book_name: string };
  chapters: Array<{
    title: string;
    sequence_number: number;
    discipline?: string | null;
    nodes?: NodeJson[];
    topics?: Array<{ title: string; sequence_number: number; micro_topics?: Array<{ title: string; sequence_number: number }> }>;
  }>;
};

type NotesJson = {
  board: string;
  grade: number;
  book_meta: { book_name: string };
  chapter_sequence_number: number;
  discipline?: string | null;
  nodes?: NodeJson[];
};

type StudyNotesGeneratedSection = {
  title?: string;
  level_label?: string;
  content_md?: string;
  /** Published syllabus node ID (from syllabus_nodes). Required for import into draft_revision_note_blocks. */
  syllabus_node_id?: string;
};

type StudyNotesGeneratedJson = {
  board: string;
  grade: number;
  subject?: string;
  book_slug?: string;
  book_meta?: { book_name: string; publication?: string; author?: string };
  chapter_sequence_number: number;
  chapter_title?: string;
  discipline?: string | null;
  generated_at?: string;
  page_count?: number | null;
  sections?: StudyNotesGeneratedSection[];
};

type QuestionItemJson = {
  /** Published syllabus_node_id for this section; applied to all questions in this item. */
  syllabus_node_id?: string;
  question_type: string;
  difficulty_level: number;
  difficulty_tag?: string;
  questions: Array<{
    question_text: string;
    model_answer_text?: string;
    rubric?: { rubric_version?: number; total_marks?: number; answer_input_type?: string; [key: string]: unknown };
    scenario_data?: Record<string, unknown> | null;
    /** Resolved syllabus_node_id (from section_ref/section_refs). When present, overrides item.syllabus_node_id. */
    syllabus_node_id?: string | null;
  }>;
};

type SampleQuestionsJson = {
  board: string;
  grade: number;
  subject: string;
  book_slug?: string;
  book_meta?: { book_name: string };
  chapter_sequence_number: number;
  chapter_title: string;
  discipline: string;
  items: QuestionItemJson[];
};

const MAX_TITLE = 4096;
const trunc = (s: string) => (s?.length > MAX_TITLE ? s.slice(0, MAX_TITLE) : s ?? '');

function isNotesOnly(): boolean {
  return process.argv.includes('--notes-only');
}

function isQuestionsOnly(): boolean {
  return process.argv.includes('--questions-only');
}

/** Positional args with --notes-only and --questions-only removed. */
function getPositionalArgs(): string[] {
  return process.argv.slice(2).filter((a) => a !== '--notes-only' && a !== '--questions-only');
}

function getDirs(): { syllabusDir: string; notesDir: string; questionsDir: string | null } {
  const args = getPositionalArgs();
  const notesOnly = isNotesOnly();
  const questionsOnly = isQuestionsOnly();
  if (notesOnly && args.length >= 1) {
    const notesDir = path.resolve(process.cwd(), args.length >= 2 ? args[1] : args[0]);
    return { syllabusDir: notesDir, notesDir, questionsDir: null };
  }
  if (questionsOnly && args.length >= 1) {
    const questionsDir = path.resolve(process.cwd(), args[0]);
    return {
      syllabusDir: path.join(ROOT, 'scripts/syllabus-extract/out'),
      notesDir: path.join(ROOT, 'scripts/study-notes-extract/out'),
      questionsDir,
    };
  }
  const syllabusDir = args[0] ? path.resolve(process.cwd(), args[0]) : path.join(ROOT, 'scripts/syllabus-extract/out');
  const notesDir = args[1] ? path.resolve(process.cwd(), args[1]) : path.join(ROOT, 'scripts/study-notes-extract/out');
  const questionsDir = args[2] ? path.resolve(process.cwd(), args[2]) : path.join(ROOT, 'scripts/question-extract-sample/out');
  return { syllabusDir, notesDir, questionsDir };
}

async function findOrCreateSubject(
  pool: ReturnType<typeof getPool>,
  board: string,
  grade: number,
  name: string
): Promise<string> {
  const sel = await pool.query<{ id: string }>(
    'SELECT id FROM subjects WHERE board = $1 AND grade_level = $2 AND name = $3',
    [board, grade, name]
  );
  if (sel.rows.length > 0) return sel.rows[0].id;
  const ins = await pool.query<{ id: string }>(
    'INSERT INTO subjects (board, grade_level, name) VALUES ($1, $2, $3) RETURNING id',
    [board, grade, name]
  );
  return ins.rows[0].id;
}

async function findSubject(
  pool: ReturnType<typeof getPool>,
  board: string,
  grade: number,
  name: string
): Promise<string | null> {
  const sel = await pool.query<{ id: string }>(
    'SELECT id FROM subjects WHERE board = $1 AND grade_level = $2 AND name = $3',
    [board, grade, name]
  );
  return sel.rows[0]?.id ?? null;
}

async function findOrCreateChapter(
  pool: ReturnType<typeof getPool>,
  subjectId: string,
  title: string,
  sequenceNumber: number,
  discipline: string | null
): Promise<string> {
  const sel = await pool.query<{ id: string }>(
    'SELECT id FROM chapters WHERE subject_id = $1 AND title = $2 AND sequence_number = $3 AND (discipline IS NOT DISTINCT FROM $4)',
    [subjectId, trunc(title), sequenceNumber, discipline]
  );
  if (sel.rows.length > 0) return sel.rows[0].id;
  const ins = await pool.query<{ id: string }>(
    'INSERT INTO chapters (subject_id, title, sequence_number, discipline) VALUES ($1, $2, $3, $4) RETURNING id',
    [subjectId, trunc(title), sequenceNumber, discipline]
  );
  return ins.rows[0].id;
}

function topicsToNodes(
  topics: Array<{ title: string; sequence_number: number; micro_topics?: Array<{ title: string; sequence_number: number }> }>
): NodeJson[] {
  return (topics || []).map((t, i) => ({
    title: t.title,
    sequence_number: t.sequence_number ?? i + 1,
    depth: 0,
    level_label: 'Section',
    children: (t.micro_topics || []).map((m, j) => ({
      title: m.title,
      sequence_number: m.sequence_number ?? j + 1,
      depth: 1,
      level_label: 'Topic',
      children: [],
    })),
  }));
}

async function insertDraftNodes(
  pool: ReturnType<typeof getPool>,
  chapterId: string,
  nodes: NodeJson[],
  parentId: string | null
): Promise<number> {
  let count = 0;
  for (const n of nodes) {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO draft_syllabus_nodes (chapter_id, parent_id, title, sequence_number, depth, level_label)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        chapterId,
        parentId,
        trunc(n.title),
        n.sequence_number ?? 0,
        n.depth ?? 0,
        (n.level_label || 'Section').slice(0, 30),
      ]
    );
    const id = r.rows[0].id;
    count++;
    if (n.children && n.children.length > 0) {
      count += await insertDraftNodes(pool, chapterId, n.children, id);
    }
  }
  return count;
}

async function upsertCurationItem(
  pool: ReturnType<typeof getPool>,
  subjectId: string,
  chapterId: string,
  contentType: 'structure' | 'notes' | 'questions' | 'revision_notes'
): Promise<string> {
  const sel = await pool.query<{ id: string }>(
    'SELECT id FROM curation_items WHERE chapter_id = $1 AND content_type = $2',
    [chapterId, contentType]
  );
  if (sel.rows.length > 0) return sel.rows[0].id;
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO curation_items (subject_id, chapter_id, content_type, status) VALUES ($1, $2, $3, 'not_started') RETURNING id`,
    [subjectId, chapterId, contentType]
  );
  return ins.rows[0].id;
}

async function findDraftNodeId(
  pool: ReturnType<typeof getPool>,
  chapterId: string,
  parentId: string | null,
  title: string,
  sequenceNumber: number
): Promise<string | null> {
  const res = await pool.query<{ id: string }>(
    `SELECT id FROM draft_syllabus_nodes WHERE chapter_id = $1 AND (parent_id IS NOT DISTINCT FROM $2) AND title = $3 AND sequence_number = $4`,
    [chapterId, parentId, trunc(title), sequenceNumber]
  );
  return res.rows[0]?.id ?? null;
}

/** Find a draft_syllabus_node in this chapter by title (any parent). Returns first match. */
async function findDraftNodeByTitle(
  pool: ReturnType<typeof getPool>,
  chapterId: string,
  title: string
): Promise<string | null> {
  const t = trunc(title);
  const res = await pool.query<{ id: string }>(
    'SELECT id FROM draft_syllabus_nodes WHERE chapter_id = $1 AND title = $2 LIMIT 1',
    [chapterId, t]
  );
  return res.rows[0]?.id ?? null;
}

/** Create a top-level draft_syllabus_node for a section (e.g. from study-notes-generate when no match). */
async function createDraftNodeForSection(
  pool: ReturnType<typeof getPool>,
  chapterId: string,
  title: string,
  levelLabel: string,
  sequenceNumber: number
): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO draft_syllabus_nodes (chapter_id, parent_id, title, sequence_number, depth, level_label)
     VALUES ($1, NULL, $2, $3, 0, $4) RETURNING id`,
    [chapterId, trunc(title), sequenceNumber, (levelLabel || 'Section').slice(0, 30)]
  );
  return res.rows[0].id;
}

function mdToHtml(md: string): string {
  if (!md?.trim()) return '';
  return (marked.parse(md, { async: false }) as string) || '';
}

async function importNotesIntoDraft(
  pool: ReturnType<typeof getPool>,
  chapterId: string,
  nodes: NodeJson[],
  parentDraftId: string | null
): Promise<number> {
  let blocks = 0;
  for (const n of nodes) {
    const draftNodeId = await findDraftNodeId(pool, chapterId, parentDraftId, n.title, n.sequence_number ?? 0);
    if (draftNodeId && n.content_blocks && n.content_blocks.length > 0) {
      for (let seq = 0; seq < n.content_blocks.length; seq++) {
        const html = mdToHtml(n.content_blocks[seq].content_md ?? '');
        await pool.query(
          'INSERT INTO draft_note_blocks (draft_syllabus_node_id, sequence_number, content_html) VALUES ($1, $2, $3)',
          [draftNodeId, seq + 1, html || '']
        );
        blocks++;
      }
    }
    if (n.children && n.children.length > 0) {
      blocks += await importNotesIntoDraft(pool, chapterId, n.children, draftNodeId);
    }
  }
  return blocks;
}

/** Import study_notes_*.json (from study-notes-generate) into draft_revision_note_blocks. Uses syllabus_node_id from each section (published node). */
async function importStudyNotesGeneratedIntoRevisionDraft(
  pool: ReturnType<typeof getPool>,
  chapterId: string,
  data: StudyNotesGeneratedJson
): Promise<number> {
  const sections = data.sections ?? [];
  const validNodeIds = new Set(
    (await pool.query<{ id: string }>('SELECT id FROM syllabus_nodes WHERE chapter_id = $1', [chapterId])).rows.map((r) => r.id)
  );
  let blocks = 0;
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const contentMd = (sec.content_md || '').trim();
    if (!contentMd) continue;
    const syllabusNodeId = sec.syllabus_node_id?.trim();
    if (!syllabusNodeId || !validNodeIds.has(syllabusNodeId)) continue;
    const html = mdToHtml(contentMd);
    await pool.query(
      'INSERT INTO draft_revision_note_blocks (chapter_id, syllabus_node_id, sequence_number, content_html) VALUES ($1, $2, $3, $4)',
      [chapterId, syllabusNodeId, 1, html || '']
    );
    blocks++;
  }
  return blocks;
}

function defaultMarks(answerInputType: string, rubricTotalMarks: number | undefined): number {
  if (rubricTotalMarks != null && Number.isFinite(rubricTotalMarks)) return Math.round(Number(rubricTotalMarks));
  return answerInputType === 'choice' ? 1 : 2;
}

function defaultAnswerInputType(questionType: string): 'typed' | 'choice' {
  const choiceTypes = new Set([
    'mcq_standard', 'mcq_logic_table', 'mcq_visual_scenario', 'mcq_assertion_reason',
    'mcq_source_connection', 'mcq_odd_one_out', 'mcq_chronology_sequence', 'mcq_relationship_analogy', 'match_columns',
  ]);
  return choiceTypes.has(questionType) ? 'choice' : 'typed';
}

async function importQuestionsIntoDraft(
  pool: ReturnType<typeof getPool>,
  subjectId: string,
  chapterId: string,
  data: SampleQuestionsJson
): Promise<number> {
  await pool.query('DELETE FROM draft_rubrics WHERE draft_question_id IN (SELECT id FROM draft_questions WHERE chapter_id = $1)', [chapterId]);
  await pool.query('DELETE FROM draft_questions WHERE chapter_id = $1', [chapterId]);
  const validNodeIds = new Set(
    (await pool.query<{ id: string }>('SELECT id FROM syllabus_nodes WHERE chapter_id = $1', [chapterId])).rows.map((r) => r.id)
  );
  let count = 0;
  const discipline = (data.discipline === 'history' || data.discipline === 'civics') ? data.discipline : 'history';
  for (const item of data.items || []) {
    const questionType = (item.question_type || 'short_answer').slice(0, 80);
    const difficultyLevel = Math.min(4, Math.max(1, Number(item.difficulty_level) || 2));
    const itemNodeId = item.syllabus_node_id && validNodeIds.has(item.syllabus_node_id) ? item.syllabus_node_id : null;
    for (const q of item.questions || []) {
      const syllabusNodeId =
        q.syllabus_node_id != null && validNodeIds.has(q.syllabus_node_id) ? q.syllabus_node_id : itemNodeId;
      const rubric = q.rubric || {};
      const answerInputType = (rubric.answer_input_type === 'typed' || rubric.answer_input_type === 'choice')
        ? rubric.answer_input_type
        : defaultAnswerInputType(questionType);
      const marks = defaultMarks(answerInputType, rubric.total_marks);
      const scenarioData =
        q.scenario_data != null && typeof q.scenario_data === 'object'
          ? JSON.stringify(q.scenario_data)
          : null;
      const ins = await pool.query<{ id: string }>(
        `INSERT INTO draft_questions (chapter_id, syllabus_node_id, question_text, question_type, discipline, difficulty_level, answer_input_type, marks, source_type, model_answer_text, scenario_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ai_generated', $9, $10) RETURNING id`,
        [
          chapterId,
          syllabusNodeId,
          (q.question_text || '').slice(0, 65535),
          questionType,
          discipline,
          difficultyLevel,
          answerInputType,
          marks,
          (q.model_answer_text ?? '').slice(0, 65535) || null,
          scenarioData,
        ]
      );
      const draftQuestionId = ins.rows[0].id;
      await pool.query(
        'INSERT INTO draft_rubrics (draft_question_id, rubric_version, rubric_json) VALUES ($1, $2, $3)',
        [draftQuestionId, Number(rubric.rubric_version) || 2, JSON.stringify(rubric)]
      );
      count++;
    }
  }
  await upsertCurationItem(pool, subjectId, chapterId, 'questions');
  return count;
}

async function main(): Promise<void> {
  const notesOnly = isNotesOnly();
  const questionsOnly = isQuestionsOnly();
  const { syllabusDir, notesDir, questionsDir } = getDirs();

  if (notesOnly) {
    if (!fs.existsSync(notesDir)) {
      console.error('Notes dir not found:', notesDir);
      process.exit(1);
    }
    const studyNotesInDir = fs.readdirSync(notesDir).filter((f) => f.endsWith('.json') && f.startsWith('study_notes_'));
    console.log('Notes-only mode: skipping syllabus and questions.');
    console.log('Notes dir:', notesDir);
    console.log('study_notes_*.json files found:', studyNotesInDir.length, studyNotesInDir.slice(0, 5).join(', '), studyNotesInDir.length > 5 ? '...' : '');
    console.log('');
  } else if (questionsOnly) {
    if (!questionsDir || !fs.existsSync(questionsDir)) {
      console.error('Questions dir not found:', questionsDir);
      process.exit(1);
    }
    const qFiles = fs.readdirSync(questionsDir).filter((f) => f.endsWith('.json') && f.startsWith('sample_questions_'));
    console.log('Questions-only mode: skipping syllabus and notes.');
    console.log('Questions dir:', questionsDir);
    console.log('sample_questions_*.json files found:', qFiles.length, qFiles.slice(0, 5).join(', '), qFiles.length > 5 ? '...' : '');
    console.log('');
  } else if (!fs.existsSync(syllabusDir)) {
    console.error('Syllabus dir not found:', syllabusDir);
    process.exit(1);
  }

  const pool = getPool();
  let totalChapters = 0;
  let totalNodes = 0;

  if (!notesOnly && !questionsOnly) {
  const syllabusFiles = fs.readdirSync(syllabusDir).filter((f) => f.endsWith('.json') && f.startsWith('syllabus_'));
  for (const file of syllabusFiles) {
    const filePath = path.join(syllabusDir, file);
    const raw = fs.readFileSync(filePath, 'utf8');
    const syllabus: SyllabusJson = JSON.parse(raw);
    if (!syllabus.board || syllabus.grade == null || !syllabus.book_meta?.book_name || !Array.isArray(syllabus.chapters)) {
      console.warn('Skip invalid syllabus:', file);
      continue;
    }
    const subjectId = await findOrCreateSubject(
      pool,
      syllabus.board,
      syllabus.grade,
      syllabus.book_meta.book_name
    );
    for (const ch of syllabus.chapters) {
      const chapterId = await findOrCreateChapter(
        pool,
        subjectId,
        ch.title,
        ch.sequence_number,
        ch.discipline ?? null
      );
      const nodes = ch.nodes ?? topicsToNodes(ch.topics ?? []);
      await pool.query(
        `DELETE FROM draft_revision_note_blocks WHERE chapter_id = $1`,
        [chapterId]
      );
      await pool.query(
        `DELETE FROM draft_note_blocks WHERE draft_syllabus_node_id IN (SELECT id FROM draft_syllabus_nodes WHERE chapter_id = $1)`,
        [chapterId]
      );
      await pool.query('DELETE FROM draft_syllabus_nodes WHERE chapter_id = $1', [chapterId]);
      if (nodes.length > 0) {
        const nodeCount = await insertDraftNodes(pool, chapterId, nodes, null);
        totalNodes += nodeCount;
      }
      await upsertCurationItem(pool, subjectId, chapterId, 'structure');
      await upsertCurationItem(pool, subjectId, chapterId, 'notes');
      totalChapters++;
    }
    console.log('Syllabus:', file, '→', syllabus.chapters.length, 'chapters');
  }
  }

  if (!questionsOnly && fs.existsSync(notesDir)) {
    const notesFiles = fs.readdirSync(notesDir).filter((f) => f.endsWith('.json') && f.startsWith('notes_') && !f.includes('manifest'));
    for (const file of notesFiles) {
      const filePath = path.join(notesDir, file);
      const raw = fs.readFileSync(filePath, 'utf8');
      const notes: NotesJson = JSON.parse(raw);
      if (!notes.board || notes.grade == null || !notes.book_meta?.book_name) continue;
      const subjectRes = await pool.query<{ id: string }>(
        'SELECT id FROM subjects WHERE board = $1 AND grade_level = $2 AND name = $3',
        [notes.board, notes.grade, notes.book_meta.book_name]
      );
      if (subjectRes.rows.length === 0) continue;
      const subjectId = subjectRes.rows[0].id;
      const chapterRes = await pool.query<{ id: string }>(
        'SELECT id FROM chapters WHERE subject_id = $1 AND sequence_number = $2 AND (discipline IS NOT DISTINCT FROM $3)',
        [subjectId, notes.chapter_sequence_number, notes.discipline ?? null]
      );
      if (chapterRes.rows.length === 0) continue;
      const chapterId = chapterRes.rows[0].id;
      if (notes.nodes && notes.nodes.length > 0) {
        await pool.query(
          `DELETE FROM draft_note_blocks WHERE draft_syllabus_node_id IN (SELECT id FROM draft_syllabus_nodes WHERE chapter_id = $1)`,
          [chapterId]
        );
        const blocks = await importNotesIntoDraft(pool, chapterId, notes.nodes, null);
        console.log('Notes:', file, '→', blocks, 'draft_note_blocks');
      }
    }

    const studyNotesFiles = fs.readdirSync(notesDir).filter((f) => f.endsWith('.json') && f.startsWith('study_notes_'));
    for (const file of studyNotesFiles) {
      const filePath = path.join(notesDir, file);
      const raw = fs.readFileSync(filePath, 'utf8');
      const data: StudyNotesGeneratedJson = JSON.parse(raw);
      const bookName = data.book_meta?.book_name?.trim() || '';
      if (!data.board || data.grade == null || !bookName) {
        console.warn('Skip invalid study_notes file:', file);
        continue;
      }
      const subjectRes = await pool.query<{ id: string }>(
        'SELECT id FROM subjects WHERE board = $1 AND grade_level = $2 AND name = $3',
        [data.board, data.grade, bookName]
      );
      if (subjectRes.rows.length === 0) {
        console.warn('Subject not found for study_notes:', file, '- book_name:', JSON.stringify(bookName), '(run full syllabus import first so subject exists; book_name must match exactly)');
        continue;
      }
      const subjectId = subjectRes.rows[0].id;
      const chapterRes = await pool.query<{ id: string }>(
        'SELECT id FROM chapters WHERE subject_id = $1 AND sequence_number = $2 AND (discipline IS NOT DISTINCT FROM $3)',
        [subjectId, data.chapter_sequence_number, data.discipline ?? null]
      );
      if (chapterRes.rows.length === 0) {
        console.warn('Chapter not found for study_notes:', file, '- chapter_sequence_number:', data.chapter_sequence_number, 'discipline:', data.discipline ?? 'null', '(run full syllabus import first)');
        continue;
      }
      const chapterId = chapterRes.rows[0].id;
      await pool.query('DELETE FROM draft_revision_note_blocks WHERE chapter_id = $1', [chapterId]);
      const blocks = await importStudyNotesGeneratedIntoRevisionDraft(pool, chapterId, data);
      if (data.page_count != null && Number.isFinite(data.page_count)) {
        await pool.query('UPDATE chapters SET page_count = $1 WHERE id = $2', [
          Math.max(1, Math.round(Number(data.page_count))),
          chapterId,
        ]);
      }
      await upsertCurationItem(pool, subjectId, chapterId, 'revision_notes');
      console.log('Revision notes (generated):', file, '→', blocks, 'draft_revision_note_blocks');
    }
  }

  let totalQuestions = 0;
  if (questionsDir && fs.existsSync(questionsDir)) {
    const questionFiles = fs.readdirSync(questionsDir).filter(
      (f) => f.endsWith('.json') && f.startsWith('sample_questions_')
    );
    for (const file of questionFiles) {
      const filePath = path.join(questionsDir, file);
      const raw = fs.readFileSync(filePath, 'utf8');
      const data: SampleQuestionsJson = JSON.parse(raw);
      const bookName = data.book_meta?.book_name?.trim() || data.subject || data.book_slug || '';
      if (!data.board || data.grade == null || !bookName) {
        console.warn('Skip invalid question file:', file);
        continue;
      }
      let subjectId = await findSubject(pool, data.board, data.grade, bookName);
      if (!subjectId && (data.subject === 'HistoryCivics' || (data.book_slug && data.book_slug.includes('HistoryCivics')))) {
        subjectId = await findSubject(pool, data.board, data.grade, 'Total History & Civics') ?? null;
      }
      if (!subjectId) {
        console.warn('Subject not found for question file:', file, '(run syllabus import first; book_name must match)');
        continue;
      }
      const chapterRes = await pool.query<{ id: string }>(
        'SELECT id FROM chapters WHERE subject_id = $1 AND sequence_number = $2 AND (discipline IS NOT DISTINCT FROM $3)',
        [subjectId, data.chapter_sequence_number, data.discipline ?? null]
      );
      if (chapterRes.rows.length === 0) {
        console.warn('Chapter not found for question file:', file, '(run syllabus import first)');
        continue;
      }
      const chapterId = chapterRes.rows[0].id;
      const qCount = await importQuestionsIntoDraft(pool, subjectId, chapterId, data);
      totalQuestions += qCount;
      console.log('Questions:', file, '→', qCount, 'draft_questions');
    }
  }

  console.log(notesOnly ? 'Curation import (notes only) done.' : `Curation import done. Chapters: ${totalChapters}, draft nodes: ${totalNodes}${totalQuestions > 0 ? `, draft questions: ${totalQuestions}` : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
