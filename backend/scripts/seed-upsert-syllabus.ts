#!/usr/bin/env node
/**
 * Upsert syllabus from JSON into DB: subject, chapters, syllabus_nodes (tree).
 * Supports chapters[].nodes (nested) or legacy chapters[].topics. Does NOT delete existing rows.
 * Run after study-notes extraction if syllabus JSON was merged.
 *
 * Run from backend/: npm run seed:upsert-syllabus [path-to-syllabus.json]
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type NodeJson = {
  title: string;
  sequence_number: number;
  depth: number;
  level_label: string;
  children?: NodeJson[];
};

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
    topics?: Array<{
      title: string;
      sequence_number: number;
      micro_topics?: Array<{ title: string; sequence_number: number }>;
    }>;
    nodes?: NodeJson[];
  }>;
};

const MAX_TITLE_LEN = 255;
const trunc = (s: string) => (s?.length > MAX_TITLE_LEN ? s.slice(0, MAX_TITLE_LEN) : s ?? '');

function getSyllabusPath(): string {
  const arg = process.argv[2];
  const env = process.env.SYLLABUS_JSON;
  const raw = arg ?? env;
  if (!raw) {
    const defaultPath = path.resolve(process.cwd(), '..', 'scripts/syllabus-extract/out/syllabus_ICSE_9_HistoryCivics_TotalHistoryCivics_MorningStar_DollyESequeira.json');
    if (fs.existsSync(defaultPath)) return defaultPath;
    console.error('Usage: npm run seed:upsert-syllabus <path-to-syllabus.json>');
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
    throw new Error('Invalid syllabus JSON');
  }
  return data as SyllabusJson;
}

async function findOrCreateSubject(
  pool: ReturnType<typeof getPool>,
  board: string,
  gradeLevel: number,
  name: string
): Promise<string> {
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

async function findOrCreateSyllabusNode(
  pool: ReturnType<typeof getPool>,
  chapterId: string,
  parentId: string | null,
  title: string,
  sequenceNumber: number,
  depth: number,
  levelLabel: string
): Promise<string> {
  const sel = await pool.query<{ id: string }>(
    `SELECT id FROM syllabus_nodes WHERE chapter_id = $1 AND (parent_id IS NOT DISTINCT FROM $2) AND title = $3 AND sequence_number = $4`,
    [chapterId, parentId, trunc(title), sequenceNumber]
  );
  if (sel.rows.length > 0) return sel.rows[0].id;
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO syllabus_nodes (chapter_id, parent_id, title, sequence_number, depth, level_label)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [chapterId, parentId, trunc(title), sequenceNumber, depth, trunc(levelLabel)]
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

async function upsertNodes(
  pool: ReturnType<typeof getPool>,
  chapterId: string,
  nodes: NodeJson[],
  parentId: string | null
): Promise<number> {
  let count = 0;
  for (const n of nodes) {
    const id = await findOrCreateSyllabusNode(
      pool,
      chapterId,
      parentId,
      n.title,
      n.sequence_number,
      n.depth ?? 0,
      n.level_label || 'Section'
    );
    count++;
    if (n.children && n.children.length > 0) {
      count += await upsertNodes(pool, chapterId, n.children, id);
    }
  }
  return count;
}

async function main(): Promise<void> {
  const filePath = getSyllabusPath();
  console.log('Loading syllabus from', filePath);
  const syllabus = loadSyllabus(filePath);
  const pool = getPool();
  const subjectId = await findOrCreateSubject(
    pool,
    syllabus.board,
    syllabus.grade,
    syllabus.book_meta.book_name
  );
  console.log('Subject:', syllabus.book_meta.book_name, '→', subjectId);

  let nodeCount = 0;
  for (const ch of syllabus.chapters) {
    const chapterId = await findOrCreateChapter(
      pool,
      subjectId,
      ch.title,
      ch.sequence_number,
      ch.discipline ?? null
    );
    const nodes = ch.nodes ?? topicsToNodes(ch.topics ?? []);
    if (nodes.length > 0) {
      nodeCount += await upsertNodes(pool, chapterId, nodes, null);
    }
  }
  console.log('Upserted', syllabus.chapters.length, 'chapters,', nodeCount, 'syllabus_nodes.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
