#!/usr/bin/env node
/**
 * Seed note_blocks (and optionally legacy notes table) from study-notes JSON(s).
 * Supports: (1) New format: data.nodes (nested tree with content_blocks) → syllabus_nodes + note_blocks.
 *           (2) Legacy: data.notes (flat) → notes table.
 * Run seed:upsert-syllabus first so syllabus_nodes exist.
 *
 * Run from backend/: npm run seed:study-notes [path-or-dir]
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import { getPool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type NodeWithContent = {
  title: string;
  sequence_number: number;
  depth?: number;
  level_label?: string;
  children?: NodeWithContent[];
  content_blocks?: Array<{ content_md: string }>;
};

type NotesJson = {
  board: string;
  grade: number;
  subject: string;
  book_slug: string;
  book_meta: { book_name: string };
  chapter_sequence_number: number;
  chapter_title: string;
  discipline?: string | null;
  notes?: Array<{
    topic_title: string;
    topic_sequence_number: number;
    micro_topic_title?: string | null;
    micro_topic_sequence_number?: number | null;
    content_md: string;
  }>;
  nodes?: NodeWithContent[];
  additional_sections?: Array<{ title: string; content_md: string }>;
};

const ALLOWED_TAGS = new Set(
  'p div br strong b em i ul ol li h1 h2 h3 h4 h5 h6 a code pre span blockquote hr'.split(' ')
);
const MAX_TITLE_LEN = 255;
const trunc = (s: string) => (s?.length > MAX_TITLE_LEN ? s.slice(0, MAX_TITLE_LEN) : s ?? '');

function getNotesPaths(): string[] {
  const arg = process.argv[2];
  const fromBackend = path.resolve(process.cwd(), '..', 'scripts/study-notes-extract/out');
  if (!arg) {
    if (!fs.existsSync(fromBackend)) {
      console.error('No path given and default dir missing:', fromBackend);
      process.exit(1);
    }
    return fs.readdirSync(fromBackend)
      .filter((f) => f.endsWith('.json') && f.startsWith('notes_') && !f.startsWith('notes_manifest_'))
      .map((f) => path.join(fromBackend, f));
  }
  const resolved = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
  if (fs.statSync(resolved).isDirectory()) {
    return fs.readdirSync(resolved)
      .filter((f) => f.endsWith('.json') && f.startsWith('notes_') && !f.startsWith('notes_manifest_'))
      .map((f) => path.join(resolved, f));
  }
  if (!fs.existsSync(resolved)) {
    console.error('File not found:', resolved);
    process.exit(1);
  }
  return [resolved];
}

function loadNotesJson(filePath: string): NotesJson {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  if (!data.board || data.grade == null || !data.book_meta?.book_name) {
    throw new Error(`Invalid notes JSON: ${filePath}`);
  }
  if (!Array.isArray(data.notes) && !Array.isArray(data.nodes)) {
    throw new Error(`Invalid notes JSON: expected notes[] or nodes[]: ${filePath}`);
  }
  return data as NotesJson;
}

/** Simple HTML sanitizer: allowlist tags, strip scripts and event handlers. */
function sanitizeHtml(html: string): string {
  // Remove script, iframe, object, embed, form
  let out = html.replace(/<\/?(script|iframe|object|embed|form)[^>]*>/gi, '');
  // Allow only safe tags; strip others (leave content)
  out = out.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (_, tagName, attrs) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (tag === 'a') {
      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']*)["']/i);
      const href = hrefMatch ? hrefMatch[1].trim() : '';
      if (href.startsWith('javascript:')) return '';
      return `<a href="${href.replace(/"/g, '&quot;')}">`;
    }
    return `<${tag}>`;
  });
  return out;
}

function mdToHtml(md: string): string {
  if (!md?.trim()) return '';
  const raw = marked.parse(md, { async: false }) as string;
  return sanitizeHtml(raw);
}

async function resolveChapterId(
  pool: ReturnType<typeof getPool>,
  subjectId: string,
  sequenceNumber: number,
  discipline: string | null
): Promise<string | null> {
  const res = await pool.query<{ id: string }>(
    'SELECT id FROM chapters WHERE subject_id = $1 AND sequence_number = $2 AND (discipline IS NOT DISTINCT FROM $3)',
    [subjectId, sequenceNumber, discipline]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveSubjectId(
  pool: ReturnType<typeof getPool>,
  board: string,
  grade: number,
  bookName: string
): Promise<string | null> {
  const res = await pool.query<{ id: string }>(
    'SELECT id FROM subjects WHERE board = $1 AND grade_level = $2 AND name = $3',
    [board, grade, bookName]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveTopicId(
  pool: ReturnType<typeof getPool>,
  chapterId: string,
  topicTitle: string
): Promise<string | null> {
  const res = await pool.query<{ id: string }>(
    'SELECT id FROM topics WHERE chapter_id = $1 AND title = $2',
    [chapterId, trunc(topicTitle)]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveMicroTopicId(
  pool: ReturnType<typeof getPool>,
  topicId: string,
  sequenceNumber: number
): Promise<string | null> {
  const res = await pool.query<{ id: string }>(
    'SELECT id FROM micro_topics WHERE topic_id = $1 AND sequence_number = $2',
    [topicId, sequenceNumber]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveSyllabusNodeId(
  pool: ReturnType<typeof getPool>,
  chapterId: string,
  parentId: string | null,
  title: string,
  sequenceNumber: number
): Promise<string | null> {
  const res = await pool.query<{ id: string }>(
    `SELECT id FROM syllabus_nodes WHERE chapter_id = $1 AND (parent_id IS NOT DISTINCT FROM $2) AND title = $3 AND sequence_number = $4`,
    [chapterId, parentId, trunc(title), sequenceNumber]
  );
  return res.rows[0]?.id ?? null;
}

async function seedNodesRecurse(
  pool: ReturnType<typeof getPool>,
  chapterId: string,
  nodes: NodeWithContent[],
  parentId: string | null,
  counts: { blocks: number }
): Promise<void> {
  for (const n of nodes) {
    const nodeId = await resolveSyllabusNodeId(
      pool,
      chapterId,
      parentId,
      n.title,
      n.sequence_number
    );
    if (nodeId) {
      if (n.content_blocks && n.content_blocks.length > 0) {
        for (let seq = 0; seq < n.content_blocks.length; seq++) {
          const html = mdToHtml(n.content_blocks[seq].content_md ?? '');
          await pool.query(
            `INSERT INTO note_blocks (syllabus_node_id, sequence_number, content_html) VALUES ($1, $2, $3)`,
            [nodeId, seq + 1, html || '']
          );
          counts.blocks++;
        }
      }
      if (n.children && n.children.length > 0) {
        await seedNodesRecurse(pool, chapterId, n.children, nodeId, counts);
      }
    }
  }
}

async function seedFromFileNodes(
  pool: ReturnType<typeof getPool>,
  filePath: string,
  data: NotesJson,
  subjectId: string,
  chapterId: string
): Promise<void> {
  await pool.query(
    `DELETE FROM note_blocks WHERE syllabus_node_id IN (SELECT id FROM syllabus_nodes WHERE chapter_id = $1)`,
    [chapterId]
  );
  const counts = { blocks: 0 };
  await seedNodesRecurse(pool, chapterId, data.nodes!, null, counts);
  console.log('  ', path.basename(filePath), '→', counts.blocks, 'note_blocks');
}

async function seedFromFileLegacy(
  pool: ReturnType<typeof getPool>,
  filePath: string,
  data: NotesJson,
  chapterId: string
): Promise<void> {
  await pool.query('DELETE FROM notes WHERE chapter_id = $1', [chapterId]);
  let inserted = 0;
  for (const note of data.notes!) {
    const topicId = await resolveTopicId(pool, chapterId, note.topic_title);
    let microTopicId: string | null = null;
    if (topicId && note.micro_topic_sequence_number != null) {
      microTopicId = await resolveMicroTopicId(pool, topicId, note.micro_topic_sequence_number);
    }
    const title = note.micro_topic_title
      ? trunc(`${note.topic_title}: ${note.micro_topic_title}`)
      : trunc(note.topic_title);
    const contentHtml = mdToHtml(note.content_md || '');
    await pool.query(
      `INSERT INTO notes (chapter_id, topic_id, micro_topic_id, title, content_html)
       VALUES ($1, $2, $3, $4, $5)`,
      [chapterId, topicId, microTopicId, title, contentHtml || '']
    );
    inserted++;
  }
  for (const sec of data.additional_sections ?? []) {
    const contentHtml = mdToHtml(sec.content_md || '');
    await pool.query(
      `INSERT INTO notes (chapter_id, topic_id, micro_topic_id, title, content_html)
       VALUES ($1, NULL, NULL, $2, $3)`,
      [chapterId, trunc(sec.title), contentHtml || '']
    );
    inserted++;
  }
  console.log('  ', path.basename(filePath), '→', inserted, 'notes (legacy)');
}

async function seedFromFile(pool: ReturnType<typeof getPool>, filePath: string): Promise<void> {
  const data = loadNotesJson(filePath);
  const subjectId = await resolveSubjectId(pool, data.board, data.grade, data.book_meta.book_name);
  if (!subjectId) {
    console.warn('  Skip: subject not found:', data.board, data.grade, data.book_meta.book_name);
    return;
  }
  const chapterId = await resolveChapterId(
    pool,
    subjectId,
    data.chapter_sequence_number,
    data.discipline ?? null
  );
  if (!chapterId) {
    console.warn('  Skip: chapter not found:', data.chapter_sequence_number, data.discipline);
    return;
  }

  if (data.nodes && data.nodes.length > 0) {
    await seedFromFileNodes(pool, filePath, data, subjectId, chapterId);
  } else if (data.notes && data.notes.length >= 0) {
    await seedFromFileLegacy(pool, filePath, data, chapterId);
  }
}

async function main(): Promise<void> {
  const paths = getNotesPaths();
  if (paths.length === 0) {
    console.error('No notes JSON files found.');
    process.exit(1);
  }
  console.log('Seeding notes from', paths.length, 'file(s)');
  const pool = getPool();
  for (const p of paths) {
    await seedFromFile(pool, p);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
