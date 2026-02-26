/**
 * Shared DB helpers for scripts that read from published structure (syllabus_nodes, note_blocks).
 * Requires: DATABASE_URL in env. Scripts that use this must have `pg` installed.
 *
 * Usage:
 *   import { getPool, resolveChapter, loadNodesWithNoteBlocks } from '../shared/db-published.mjs';
 */

import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set (e.g. in .env or backend/.env)');
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

/**
 * Resolve chapter to get chapterId and meta for output.
 * @param {pg.Pool} pool
 * @param {{ chapterId?: string } | { board: string, grade: number, subjectName: string, chapterNum: number, discipline?: string | null }} opts
 *   Either chapterId (option B) or board, grade, subjectName (book name), chapterNum, discipline (option A).
 * @returns {Promise<{ chapterId: string, chapterTitle: string, sequenceNumber: number, subjectName: string, grade: number, discipline: string | null, subjectId: string } | null>}
 */
export async function resolveChapter(pool, opts) {
  if (opts.chapterId) {
    const r = await pool.query(
      `SELECT c.id AS chapter_id, c.title AS chapter_title, c.sequence_number, c.discipline,
              s.id AS subject_id, s.name AS subject_name, s.grade_level AS grade
       FROM chapters c
       JOIN subjects s ON s.id = c.subject_id
       WHERE c.id = $1`,
      [opts.chapterId]
    );
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return {
      chapterId: row.chapter_id,
      chapterTitle: row.chapter_title,
      sequenceNumber: row.sequence_number ?? 1,
      subjectName: row.subject_name,
      grade: row.grade,
      discipline: row.discipline ?? null,
      subjectId: row.subject_id,
    };
  }
  const { board = 'ICSE', grade, subjectName, chapterNum, discipline = null } = opts;
  const r = await pool.query(
    `SELECT c.id AS chapter_id, c.title AS chapter_title, c.sequence_number, s.id AS subject_id, s.name AS subject_name, s.grade_level AS grade
     FROM chapters c
     JOIN subjects s ON s.id = c.subject_id
     WHERE s.board = $1 AND s.grade_level = $2 AND s.name = $3
       AND c.sequence_number = $4 AND (c.discipline IS NOT DISTINCT FROM $5)`,
    [board, grade, subjectName, chapterNum, discipline]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    chapterId: row.chapter_id,
    chapterTitle: row.chapter_title,
    sequenceNumber: row.sequence_number ?? 1,
    subjectName: row.subject_name,
    grade: row.grade,
    discipline,
    subjectId: row.subject_id,
  };
}

/**
 * Load published syllabus_nodes for a chapter in tree order, with their note_blocks content concatenated.
 * @param {pg.Pool} pool
 * @param {string} chapterId
 * @returns {Promise<Array<{ id: string, title: string, depth: number, level_label: string, content_html: string }>>}
 */
export async function loadNodesWithNoteBlocks(pool, chapterId) {
  const nodes = await pool.query(
    `WITH RECURSIVE tree AS (
      SELECT id, title, depth, level_label, ARRAY[sequence_number] AS sort_path
      FROM syllabus_nodes
      WHERE chapter_id = $1 AND parent_id IS NULL
      UNION ALL
      SELECT n.id, n.title, n.depth, n.level_label, t.sort_path || n.sequence_number
      FROM syllabus_nodes n
      JOIN tree t ON n.parent_id = t.id
    )
    SELECT id, title, depth, level_label FROM tree ORDER BY sort_path`,
    [chapterId]
  );
  const blocks = await pool.query(
    `SELECT syllabus_node_id, sequence_number, content_html
     FROM note_blocks
     WHERE syllabus_node_id IN (SELECT id FROM syllabus_nodes WHERE chapter_id = $1)
     ORDER BY syllabus_node_id, sequence_number`,
    [chapterId]
  );
  const byNode = new Map();
  for (const b of blocks.rows) {
    const cur = byNode.get(b.syllabus_node_id) || '';
    byNode.set(b.syllabus_node_id, cur + (b.content_html || ''));
  }
  return nodes.rows.map((n) => ({
    id: n.id,
    title: n.title,
    depth: n.depth ?? 0,
    level_label: n.level_label || 'Section',
    content_html: byNode.get(n.id) || '',
  }));
}

/** Count words in HTML: strip tags, then split on whitespace. */
function countWords(html) {
  if (!html || typeof html !== 'string') return 0;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}

/**
 * Load published syllabus tree for a chapter with path-from-root and subtree stats for content-aware long-format.
 * Word count is from revision_note_blocks (published notes) for the node and all descendants.
 * @param {pg.Pool} pool
 * @param {string} chapterId
 * @returns {Promise<Array<{ id: string, parent_id: string | null, title: string, depth: number, level_label: string, path: string, descendant_count: number, word_count: number }>>}
 */
export async function loadTreeWithPathsAndEligibility(pool, chapterId) {
  const nodes = await pool.query(
    `WITH RECURSIVE tree AS (
      SELECT id, parent_id, title, depth, level_label, ARRAY[sequence_number] AS sort_path, title::text AS path
      FROM syllabus_nodes
      WHERE chapter_id = $1 AND parent_id IS NULL
      UNION ALL
      SELECT n.id, n.parent_id, n.title, n.depth, n.level_label, t.sort_path || n.sequence_number, t.path || ' > ' || n.title
      FROM syllabus_nodes n
      JOIN tree t ON n.parent_id = t.id
    )
    SELECT id, parent_id, title, depth, level_label, path FROM tree ORDER BY sort_path`,
    [chapterId]
  );
  const blocks = await pool.query(
    `SELECT r.syllabus_node_id, r.content_html
     FROM revision_note_blocks r
     JOIN syllabus_nodes sn ON sn.id = r.syllabus_node_id
     WHERE sn.chapter_id = $1`,
    [chapterId]
  );
  const wordCountByNode = new Map();
  for (const b of blocks.rows) {
    const w = countWords(b.content_html || '');
    wordCountByNode.set(b.syllabus_node_id, (wordCountByNode.get(b.syllabus_node_id) || 0) + w);
  }
  const rows = nodes.rows;
  const idToIndex = new Map(rows.map((r, i) => [r.id, i]));
  const children = new Map();
  for (const r of rows) {
    if (r.parent_id) {
      if (!children.has(r.parent_id)) children.set(r.parent_id, []);
      children.get(r.parent_id).push(r.id);
    }
  }
  function descendantIds(nodeId) {
    const out = [];
    const stack = [nodeId];
    while (stack.length) {
      const id = stack.pop();
      for (const cid of children.get(id) || []) {
        out.push(cid);
        stack.push(cid);
      }
    }
    return out;
  }
  return rows.map((r) => {
    const descIds = descendantIds(r.id);
    let wordCount = wordCountByNode.get(r.id) || 0;
    for (const did of descIds) wordCount += wordCountByNode.get(did) || 0;
    return {
      id: r.id,
      parent_id: r.parent_id,
      title: r.title,
      depth: r.depth ?? 0,
      level_label: r.level_label || 'Section',
      path: r.path,
      descendant_count: descIds.length,
      word_count: wordCount,
    };
  });
}
