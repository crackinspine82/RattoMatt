#!/usr/bin/env node
/**
 * Seed Postgres subjects, chapters, topics, and micro_topics from a syllabus JSON
 * produced by scripts/syllabus-extract.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/seed-from-syllabus.ts <path-to-syllabus.json>
 * Or set DATABASE_URL in backend/.env and run from backend/: npm run seed:syllabus -- <path>
 *
 * Idempotency: Reuses subject by (board, grade_level, name). Deletes existing chapters
 * (and their topics, micro_topics) for that subject, then inserts from the JSON.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type SyllabusJson = {
  board: string;
  grade: number;
  subject: string;
  book_slug: string;
  book_meta: { book_name: string; publication?: string; author?: string };
  chapters: Array<{
    title: string;
    sequence_number: number;
    discipline?: string | null;
    structure_notes?: string;
    topics: Array<{
      title: string;
      sequence_number: number;
      micro_topics?: Array<{ title: string; sequence_number: number }>;
    }>;
  }>;
};

/** Default syllabus path relative to repo root (backend is repo/backend). */
const DEFAULT_SYLLABUS = 'scripts/syllabus-extract/out/syllabus_ICSE_9_HistoryCivics_TotalHistoryCivics_MorningStar_DollyESequeira.json';

function getSyllabusPath(): string {
  const arg = process.argv[2];
  const env = process.env.SYLLABUS_JSON;
  let raw = arg ?? env;
  if (!raw) {
    // Resolve default from backend/ (where cwd is when run via npm run seed:syllabus)
    const fromBackend = path.resolve(process.cwd(), '..', DEFAULT_SYLLABUS);
    if (fs.existsSync(fromBackend)) {
      raw = fromBackend;
    } else {
      const fromScriptDir = path.resolve(__dirname, '..', '..', DEFAULT_SYLLABUS);
      if (fs.existsSync(fromScriptDir)) raw = fromScriptDir;
    }
  }
  if (!raw) {
    console.error('Usage: npm run seed:syllabus [path-to-syllabus.json]');
    console.error('   Or:  SYLLABUS_JSON=/path/to/syllabus.json npm run seed:syllabus');
    console.error('Default path tried:', path.resolve(process.cwd(), '..', DEFAULT_SYLLABUS));
    process.exit(1);
  }
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  if (!fs.existsSync(resolved)) {
    console.error('File not found:', resolved);
    process.exit(1);
  }
  return resolved;
}

function loadSyllabus(filePath: string): SyllabusJson {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  if (!data.board || data.grade == null || !data.subject || !data.book_meta?.book_name || !Array.isArray(data.chapters)) {
    throw new Error('Invalid syllabus JSON: expected board, grade, subject, book_meta.book_name, chapters[]');
  }
  return data as SyllabusJson;
}

async function findOrCreateSubject(
  board: string,
  gradeLevel: number,
  name: string
): Promise<string> {
  const pool = getPool();
  const sel = await pool.query<{ id: string }>(
    'SELECT id FROM subjects WHERE board = $1 AND grade_level = $2 AND name = $3',
    [board, gradeLevel, name]
  );
  if (sel.rows.length > 0) return sel.rows[0].id;
  const ins = await pool.query<{ id: string }>(
    'INSERT INTO subjects (board, grade_level, name) VALUES ($1, $2, $3) RETURNING id',
    [board, gradeLevel, name]
  );
  return ins.rows[0].id;
}

async function deleteChaptersForSubject(subjectId: string): Promise<void> {
  const pool = getPool();
  // Delete micro_topics for topics that belong to chapters of this subject
  await pool.query(
    `DELETE FROM micro_topics WHERE topic_id IN (
      SELECT t.id FROM topics t
      JOIN chapters c ON c.id = t.chapter_id
      WHERE c.subject_id = $1
    )`,
    [subjectId]
  );
  await pool.query('DELETE FROM topics WHERE chapter_id IN (SELECT id FROM chapters WHERE subject_id = $1)', [subjectId]);
  await pool.query('DELETE FROM chapters WHERE subject_id = $1', [subjectId]);
}

async function seed(syllabus: SyllabusJson): Promise<void> {
  const pool = getPool();
  const name = syllabus.book_meta.book_name;
  const subjectId = await findOrCreateSubject(syllabus.board, syllabus.grade, name);
  console.log('Subject:', name, '→ id', subjectId);

  await deleteChaptersForSubject(subjectId);
  console.log('Cleared existing chapters/topics/micro_topics for this subject.');

  const MAX_TITLE_LEN = 255;
  const trunc = (s: string) => (s?.length > MAX_TITLE_LEN ? s.slice(0, MAX_TITLE_LEN) : s ?? '');

  for (const ch of syllabus.chapters) {
    const discipline = ch.discipline ?? null;
    const chRes = await pool.query<{ id: string }>(
      'INSERT INTO chapters (subject_id, title, sequence_number, discipline) VALUES ($1, $2, $3, $4) RETURNING id',
      [subjectId, trunc(ch.title), ch.sequence_number, discipline]
    );
    const chapterId = chRes.rows[0].id;

    const topics = ch.topics ?? [];
    for (const top of topics) {
      const topRes = await pool.query<{ id: string }>(
        'INSERT INTO topics (chapter_id, title, sequence_number) VALUES ($1, $2, $3) RETURNING id',
        [chapterId, trunc(top.title), top.sequence_number]
      );
      const topicId = topRes.rows[0].id;

      const microTopics = top.micro_topics ?? [];
      for (const mt of microTopics) {
        await pool.query(
          'INSERT INTO micro_topics (topic_id, title, sequence_number) VALUES ($1, $2, $3)',
          [topicId, trunc(mt.title), mt.sequence_number]
        );
      }
    }
  }
  console.log('Inserted', syllabus.chapters.length, 'chapters with topics and micro_topics.');
}

async function main(): Promise<void> {
  const filePath = getSyllabusPath();
  console.log('Loading syllabus from', filePath);
  const syllabus = loadSyllabus(filePath);
  console.log('Board:', syllabus.board, 'Grade:', syllabus.grade, 'Subject:', syllabus.subject, 'Book:', syllabus.book_meta.book_name);

  await seed(syllabus);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
