/**
 * Curation API: list items, get/save draft structure, get/save draft notes, set status, upload image.
 * See docs/CURATION_SYSTEM.md. Auth: requireCurationAuth on all routes except list (v1 full list).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getPool } from '../db.js';
import { requireCurationAuth } from './curation-auth.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

type CurationItem = {
  id: string;
  subject_id: string;
  chapter_id: string;
  content_type: string;
  status: string;
  subject_name: string;
  chapter_title: string;
  chapter_sequence_number: number;
};

type DraftNode = {
  id: string;
  chapter_id: string;
  parent_id: string | null;
  title: string;
  sequence_number: number;
  depth: number;
  level_label: string;
};

type DraftNoteBlock = {
  id: string;
  draft_syllabus_node_id: string;
  sequence_number: number;
  content_html: string;
};

type DraftQuestion = {
  id: string;
  chapter_id: string;
  draft_syllabus_node_id: string | null;
  question_text: string;
  question_type: string;
  discipline: string;
  difficulty_level: number;
  answer_input_type: string;
  marks: number;
  source_type: string;
  model_answer_text: string | null;
  rubric_version?: number;
  rubric_json?: Record<string, unknown>;
};

export default async function curationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireCurationAuth);

  app.get('/curation/items', async (_req: FastifyRequest, reply: FastifyReply) => {
    const pool = getPool();
    const res = await pool.query<CurationItem & { name: string; title: string; sequence_number: number }>(
      `SELECT c.id, c.subject_id, c.chapter_id, c.content_type, c.status,
              s.name AS subject_name, ch.title AS chapter_title, ch.sequence_number AS chapter_sequence_number
       FROM curation_items c
       JOIN subjects s ON s.id = c.subject_id
       JOIN chapters ch ON ch.id = c.chapter_id
       ORDER BY s.name, ch.sequence_number, c.content_type`
    );
    const items = res.rows.map((r) => ({
      id: r.id,
      subject_id: r.subject_id,
      chapter_id: r.chapter_id,
      content_type: r.content_type,
      status: r.status,
      subject_name: r.subject_name,
      chapter_title: r.chapter_title,
      chapter_sequence_number: r.chapter_sequence_number,
    }));
    return reply.send({ items });
  });

  app.get<{ Params: { id: string } }>('/curation/items/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const pool = getPool();
    const res = await pool.query<CurationItem & { subject_name: string; chapter_title: string }>(
      `SELECT c.id, c.subject_id, c.chapter_id, c.content_type, c.status,
              s.name AS subject_name, ch.title AS chapter_title, ch.sequence_number AS chapter_sequence_number
       FROM curation_items c
       JOIN subjects s ON s.id = c.subject_id
       JOIN chapters ch ON ch.id = c.chapter_id
       WHERE c.id = $1`,
      [id]
    );
    if (res.rows.length === 0) return reply.status(404).send({ error: 'Curation item not found' });
    const r = res.rows[0];
    return reply.send({
      id: r.id,
      subject_id: r.subject_id,
      chapter_id: r.chapter_id,
      content_type: r.content_type,
      status: r.status,
      subject_name: r.subject_name,
      chapter_title: r.chapter_title,
      chapter_sequence_number: r.chapter_sequence_number,
    });
  });

  app.get<{ Params: { id: string } }>('/curation/items/:id/structure', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const pool = getPool();
    const itemRes = await pool.query<{ chapter_id: string; content_type: string }>(
      'SELECT chapter_id, content_type FROM curation_items WHERE id = $1',
      [id]
    );
    if (itemRes.rows.length === 0) return reply.status(404).send({ error: 'Curation item not found' });
    if (itemRes.rows[0].content_type !== 'structure') return reply.status(400).send({ error: 'Not a structure item' });
    const chapterId = itemRes.rows[0].chapter_id;
    const nodesRes = await pool.query<DraftNode>(
      `WITH RECURSIVE tree AS (
        SELECT id, chapter_id, parent_id, title, sequence_number, depth, level_label,
               ARRAY[sequence_number] AS sort_path
        FROM draft_syllabus_nodes
        WHERE chapter_id = $1 AND parent_id IS NULL
        UNION ALL
        SELECT n.id, n.chapter_id, n.parent_id, n.title, n.sequence_number, n.depth, n.level_label,
               t.sort_path || n.sequence_number
        FROM draft_syllabus_nodes n
        JOIN tree t ON n.parent_id = t.id
      )
      SELECT id, chapter_id, parent_id, title, sequence_number, depth, level_label FROM tree ORDER BY sort_path`,
      [chapterId]
    );
    const nodes = nodesRes.rows;
    return reply.send({ nodes });
  });

  app.put<{
    Params: { id: string };
    Body: { nodes: Array<{ id?: string; parent_id: string | null; title: string; sequence_number: number; depth: number; level_label: string }> };
  }>('/curation/items/:id/structure', async (req: FastifyRequest<{ Params: { id: string }; Body: { nodes: Array<{ id?: string; parent_id: string | null; title: string; sequence_number: number; depth: number; level_label: string }> } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const { nodes } = req.body ?? {};
    if (!Array.isArray(nodes)) return reply.status(400).send({ error: 'nodes array required' });
    const pool = getPool();
    const itemRes = await pool.query<{ chapter_id: string; content_type: string }>(
      'SELECT chapter_id, content_type FROM curation_items WHERE id = $1',
      [id]
    );
    if (itemRes.rows.length === 0) return reply.status(404).send({ error: 'Curation item not found' });
    const contentType = itemRes.rows[0].content_type;
    if (contentType !== 'structure' && contentType !== 'notes') return reply.status(400).send({ error: 'Structure can only be saved for a structure or notes item' });
    const chapterId = itemRes.rows[0].chapter_id;

    // Option A: preserve nodes and note blocks. Update existing nodes by id; insert only new nodes; delete only nodes removed from payload.
    const existingRes = await pool.query<{ id: string }>('SELECT id FROM draft_syllabus_nodes WHERE chapter_id = $1', [chapterId]);
    const existingIds = new Set(existingRes.rows.map((r) => r.id));
    const payloadIds = new Set(nodes.map((n) => n.id).filter(Boolean) as string[]);

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const seq = n.sequence_number ?? i + 1;
      const title = (n.title || '').slice(0, 4096);
      const levelLabel = (n.level_label || 'Section').slice(0, 30);
      const depth = n.depth ?? 0;

      if (n.id && existingIds.has(n.id)) {
        const parentId = n.parent_id && (existingIds.has(n.parent_id) || payloadIds.has(n.parent_id)) ? n.parent_id : null;
        await pool.query(
          `UPDATE draft_syllabus_nodes SET parent_id = $1, title = $2, sequence_number = $3, depth = $4, level_label = $5
           WHERE id = $6 AND chapter_id = $7`,
          [parentId, title, seq, depth, levelLabel, n.id, chapterId]
        );
      } else {
        const parentId = n.parent_id && (existingIds.has(n.parent_id) || payloadIds.has(n.parent_id)) ? n.parent_id : null;
        await pool.query(
          `INSERT INTO draft_syllabus_nodes (chapter_id, parent_id, title, sequence_number, depth, level_label)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [chapterId, parentId, title, seq, depth, levelLabel]
        );
      }
    }

    const removedIds = [...existingIds].filter((nodeId) => !payloadIds.has(nodeId));
    if (removedIds.length > 0) {
      await pool.query(
        'DELETE FROM draft_note_blocks WHERE draft_syllabus_node_id = ANY($1::uuid[])',
        [removedIds]
      );
      await pool.query('DELETE FROM draft_syllabus_nodes WHERE id = ANY($1::uuid[])', [removedIds]);
    }

    await pool.query(
      "UPDATE curation_items SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    );
    const nodesRes = await pool.query<DraftNode>(
      `WITH RECURSIVE tree AS (
        SELECT id, chapter_id, parent_id, title, sequence_number, depth, level_label,
               ARRAY[sequence_number] AS sort_path
        FROM draft_syllabus_nodes
        WHERE chapter_id = $1 AND parent_id IS NULL
        UNION ALL
        SELECT n.id, n.chapter_id, n.parent_id, n.title, n.sequence_number, n.depth, n.level_label,
               t.sort_path || n.sequence_number
        FROM draft_syllabus_nodes n
        JOIN tree t ON n.parent_id = t.id
      )
      SELECT id, chapter_id, parent_id, title, sequence_number, depth, level_label FROM tree ORDER BY sort_path`,
      [chapterId]
    );
    return reply.send({ nodes: nodesRes.rows });
  });

  /** GET full-extract for structure item: nodes (tree) + full-extract blocks + notes_item_id for saving. Used by combined Structure page. */
  app.get<{ Params: { id: string } }>('/curation/items/:id/full-extract', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const pool = getPool();
    const itemRes = await pool.query<{ chapter_id: string; content_type: string }>(
      'SELECT chapter_id, content_type FROM curation_items WHERE id = $1',
      [id]
    );
    if (itemRes.rows.length === 0) return reply.status(404).send({ error: 'Curation item not found' });
    if (itemRes.rows[0].content_type !== 'structure') return reply.status(400).send({ error: 'Not a structure item' });
    const chapterId = itemRes.rows[0].chapter_id;
    const notesItemRes = await pool.query<{ id: string }>(
      "SELECT id FROM curation_items WHERE chapter_id = $1 AND content_type = 'notes'",
      [chapterId]
    );
    const notesItemId = notesItemRes.rows[0]?.id ?? null;
    const nodesRes = await pool.query<DraftNode>(
      `WITH RECURSIVE tree AS (
        SELECT id, chapter_id, parent_id, title, sequence_number, depth, level_label,
               ARRAY[sequence_number] AS sort_path
        FROM draft_syllabus_nodes
        WHERE chapter_id = $1 AND parent_id IS NULL
        UNION ALL
        SELECT n.id, n.chapter_id, n.parent_id, n.title, n.sequence_number, n.depth, n.level_label,
               t.sort_path || n.sequence_number
        FROM draft_syllabus_nodes n
        JOIN tree t ON n.parent_id = t.id
      )
      SELECT id, chapter_id, parent_id, title, sequence_number, depth, level_label FROM tree ORDER BY sort_path`,
      [chapterId]
    );
    const blocksRes = await pool.query<DraftNoteBlock>(
      `SELECT b.id, b.draft_syllabus_node_id, b.sequence_number, b.content_html
       FROM draft_note_blocks b
       JOIN draft_syllabus_nodes n ON n.id = b.draft_syllabus_node_id
       WHERE n.chapter_id = $1 ORDER BY b.draft_syllabus_node_id, b.sequence_number`,
      [chapterId]
    );
    return reply.send({ nodes: nodesRes.rows, blocks: blocksRes.rows, notes_item_id: notesItemId });
  });

  app.get<{ Params: { id: string } }>('/curation/items/:id/notes', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const pool = getPool();
    const itemRes = await pool.query<{ chapter_id: string; content_type: string }>(
      'SELECT chapter_id, content_type FROM curation_items WHERE id = $1',
      [id]
    );
    if (itemRes.rows.length === 0) return reply.status(404).send({ error: 'Curation item not found' });
    if (itemRes.rows[0].content_type !== 'notes') return reply.status(400).send({ error: 'Not a notes item' });
    const chapterId = itemRes.rows[0].chapter_id;
    const nodesRes = await pool.query<DraftNode>(
      `WITH RECURSIVE tree AS (
        SELECT id, chapter_id, parent_id, title, sequence_number, depth, level_label,
               ARRAY[sequence_number] AS sort_path
        FROM draft_syllabus_nodes
        WHERE chapter_id = $1 AND parent_id IS NULL
        UNION ALL
        SELECT n.id, n.chapter_id, n.parent_id, n.title, n.sequence_number, n.depth, n.level_label,
               t.sort_path || n.sequence_number
        FROM draft_syllabus_nodes n
        JOIN tree t ON n.parent_id = t.id
      )
      SELECT id, chapter_id, parent_id, title, sequence_number, depth, level_label FROM tree ORDER BY sort_path`,
      [chapterId]
    );
    const blocksRes = await pool.query<DraftNoteBlock>(
      `SELECT b.id, b.draft_syllabus_node_id, b.sequence_number, b.content_html
       FROM draft_note_blocks b
       JOIN draft_syllabus_nodes n ON n.id = b.draft_syllabus_node_id
       WHERE n.chapter_id = $1 ORDER BY b.draft_syllabus_node_id, b.sequence_number`,
      [chapterId]
    );
    return reply.send({ nodes: nodesRes.rows, blocks: blocksRes.rows });
  });

  app.put<{
    Params: { id: string };
    Body: { blocks: Array<{ draft_syllabus_node_id: string; sequence_number: number; content_html: string }> };
  }>('/curation/items/:id/notes', async (req: FastifyRequest<{ Params: { id: string }; Body: { blocks: Array<{ draft_syllabus_node_id: string; sequence_number: number; content_html: string }> } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const { blocks } = req.body ?? {};
    if (!Array.isArray(blocks)) return reply.status(400).send({ error: 'blocks array required' });
    const pool = getPool();
    const itemRes = await pool.query<{ chapter_id: string; content_type: string }>(
      'SELECT chapter_id, content_type FROM curation_items WHERE id = $1',
      [id]
    );
    if (itemRes.rows.length === 0) return reply.status(404).send({ error: 'Curation item not found' });
    if (itemRes.rows[0].content_type !== 'notes') return reply.status(400).send({ error: 'Not a notes item' });
    const chapterId = itemRes.rows[0].chapter_id;
    const nodeIds = await pool.query<{ id: string }>('SELECT id FROM draft_syllabus_nodes WHERE chapter_id = $1', [chapterId]);
    const validNodeIds = new Set(nodeIds.rows.map((r) => r.id));
    await pool.query(
      `DELETE FROM draft_note_blocks WHERE draft_syllabus_node_id IN (SELECT id FROM draft_syllabus_nodes WHERE chapter_id = $1)`,
      [chapterId]
    );
    for (const b of blocks) {
      if (!validNodeIds.has(b.draft_syllabus_node_id)) continue;
      await pool.query(
        'INSERT INTO draft_note_blocks (draft_syllabus_node_id, sequence_number, content_html) VALUES ($1, $2, $3)',
        [b.draft_syllabus_node_id, b.sequence_number ?? 0, (b.content_html || '').slice(0, 500000)]
      );
    }
    await pool.query(
      "UPDATE curation_items SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    );
    const blocksRes = await pool.query<DraftNoteBlock>(
      `SELECT b.id, b.draft_syllabus_node_id, b.sequence_number, b.content_html
       FROM draft_note_blocks b JOIN draft_syllabus_nodes n ON n.id = b.draft_syllabus_node_id WHERE n.chapter_id = $1 ORDER BY b.draft_syllabus_node_id, b.sequence_number`,
      [chapterId]
    );
    return reply.send({ blocks: blocksRes.rows });
  });

  app.patch<{
    Params: { id: string; nodeId: string };
    Body: { title: string };
  }>('/curation/items/:id/notes/nodes/:nodeId', async (req: FastifyRequest<{ Params: { id: string; nodeId: string }; Body: { title: string } }>, reply: FastifyReply) => {
    const { id, nodeId } = req.params;
    const title = (req.body as { title?: string } | null)?.title;
    if (typeof title !== 'string' || !title.trim()) return reply.status(400).send({ error: 'title required' });
    const pool = getPool();
    const itemRes = await pool.query<{ chapter_id: string; content_type: string }>(
      'SELECT chapter_id, content_type FROM curation_items WHERE id = $1',
      [id]
    );
    if (itemRes.rows.length === 0) return reply.status(404).send({ error: 'Curation item not found' });
    if (itemRes.rows[0].content_type !== 'notes') return reply.status(400).send({ error: 'Not a notes item' });
    const chapterId = itemRes.rows[0].chapter_id;
    const updateRes = await pool.query<DraftNode>(
      `UPDATE draft_syllabus_nodes SET title = $1 WHERE id = $2 AND chapter_id = $3
       RETURNING id, chapter_id, parent_id, title, sequence_number, depth, level_label`,
      [title.trim().slice(0, 4096), nodeId, chapterId]
    );
    if (updateRes.rows.length === 0) return reply.status(404).send({ error: 'Node not found or wrong chapter' });
    return reply.send({ node: updateRes.rows[0] });
  });

  app.get<{ Params: { id: string } }>('/curation/items/:id/revision-notes', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const pool = getPool();
    const itemRes = await pool.query<{ chapter_id: string; content_type: string }>(
      'SELECT chapter_id, content_type FROM curation_items WHERE id = $1',
      [id]
    );
    if (itemRes.rows.length === 0) return reply.status(404).send({ error: 'Curation item not found' });
    if (itemRes.rows[0].content_type !== 'revision_notes') return reply.status(400).send({ error: 'Not a revision_notes item' });
    const chapterId = itemRes.rows[0].chapter_id;
    const nodesRes = await pool.query<DraftNode>(
      `WITH RECURSIVE tree AS (
        SELECT id, chapter_id, parent_id, title, sequence_number, depth, level_label,
               ARRAY[sequence_number] AS sort_path
        FROM draft_syllabus_nodes
        WHERE chapter_id = $1 AND parent_id IS NULL
        UNION ALL
        SELECT n.id, n.chapter_id, n.parent_id, n.title, n.sequence_number, n.depth, n.level_label,
               t.sort_path || n.sequence_number
        FROM draft_syllabus_nodes n
        JOIN tree t ON n.parent_id = t.id
      )
      SELECT id, chapter_id, parent_id, title, sequence_number, depth, level_label FROM tree ORDER BY sort_path`,
      [chapterId]
    );
    const blocksRes = await pool.query<DraftNoteBlock>(
      `SELECT b.id, b.draft_syllabus_node_id, b.sequence_number, b.content_html
       FROM draft_revision_note_blocks b
       JOIN draft_syllabus_nodes n ON n.id = b.draft_syllabus_node_id
       WHERE n.chapter_id = $1 ORDER BY b.draft_syllabus_node_id, b.sequence_number`,
      [chapterId]
    );
    return reply.send({ nodes: nodesRes.rows, blocks: blocksRes.rows });
  });

  app.put<{
    Params: { id: string };
    Body: { blocks: Array<{ draft_syllabus_node_id: string; sequence_number: number; content_html: string }> };
  }>('/curation/items/:id/revision-notes', async (req: FastifyRequest<{ Params: { id: string }; Body: { blocks: Array<{ draft_syllabus_node_id: string; sequence_number: number; content_html: string }> } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const { blocks } = req.body ?? {};
    if (!Array.isArray(blocks)) return reply.status(400).send({ error: 'blocks array required' });
    const pool = getPool();
    const itemRes = await pool.query<{ chapter_id: string; content_type: string }>(
      'SELECT chapter_id, content_type FROM curation_items WHERE id = $1',
      [id]
    );
    if (itemRes.rows.length === 0) return reply.status(404).send({ error: 'Curation item not found' });
    if (itemRes.rows[0].content_type !== 'revision_notes') return reply.status(400).send({ error: 'Not a revision_notes item' });
    const chapterId = itemRes.rows[0].chapter_id;
    const nodeIds = await pool.query<{ id: string }>('SELECT id FROM draft_syllabus_nodes WHERE chapter_id = $1', [chapterId]);
    const validNodeIds = new Set(nodeIds.rows.map((r) => r.id));
    await pool.query(
      `DELETE FROM draft_revision_note_blocks WHERE draft_syllabus_node_id IN (SELECT id FROM draft_syllabus_nodes WHERE chapter_id = $1)`,
      [chapterId]
    );
    for (const b of blocks) {
      if (!validNodeIds.has(b.draft_syllabus_node_id)) continue;
      await pool.query(
        'INSERT INTO draft_revision_note_blocks (draft_syllabus_node_id, sequence_number, content_html) VALUES ($1, $2, $3)',
        [b.draft_syllabus_node_id, b.sequence_number ?? 0, (b.content_html || '').slice(0, 500000)]
      );
    }
    await pool.query(
      "UPDATE curation_items SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    );
    const blocksRes = await pool.query<DraftNoteBlock>(
      `SELECT b.id, b.draft_syllabus_node_id, b.sequence_number, b.content_html
       FROM draft_revision_note_blocks b JOIN draft_syllabus_nodes n ON n.id = b.draft_syllabus_node_id WHERE n.chapter_id = $1 ORDER BY b.draft_syllabus_node_id, b.sequence_number`,
      [chapterId]
    );
    return reply.send({ blocks: blocksRes.rows });
  });

  app.get<{ Params: { id: string } }>('/curation/items/:id/questions', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    const pool = getPool();
    const itemRes = await pool.query<{ chapter_id: string; content_type: string }>(
      'SELECT chapter_id, content_type FROM curation_items WHERE id = $1',
      [id]
    );
    if (itemRes.rows.length === 0) return reply.status(404).send({ error: 'Curation item not found' });
    if (itemRes.rows[0].content_type !== 'questions') return reply.status(400).send({ error: 'Not a questions item' });
    const chapterId = itemRes.rows[0].chapter_id;
    const qRes = await pool.query<DraftQuestion & { rubric_version: number; rubric_json: unknown; ready_to_publish: boolean }>(
      `SELECT q.id, q.chapter_id, q.draft_syllabus_node_id, q.question_text, q.question_type, q.discipline, q.difficulty_level,
              q.answer_input_type, q.marks, q.source_type, q.model_answer_text, q.ready_to_publish, r.rubric_version, r.rubric_json
       FROM draft_questions q
       LEFT JOIN draft_rubrics r ON r.draft_question_id = q.id
       WHERE q.chapter_id = $1 ORDER BY q.id`,
      [chapterId]
    );
    const questions = qRes.rows.map((r) => ({
      id: r.id,
      chapter_id: r.chapter_id,
      draft_syllabus_node_id: r.draft_syllabus_node_id,
      question_text: r.question_text,
      question_type: r.question_type,
      discipline: r.discipline,
      difficulty_level: r.difficulty_level,
      answer_input_type: r.answer_input_type,
      marks: r.marks,
      source_type: r.source_type,
      model_answer_text: r.model_answer_text,
      ready_to_publish: r.ready_to_publish ?? false,
      rubric: { rubric_version: r.rubric_version ?? 2, rubric_json: r.rubric_json ?? {} },
    }));
    return reply.send({ questions });
  });

  app.put<{
    Params: { id: string };
    Body: {
      questions: Array<{
        id?: string;
        draft_syllabus_node_id?: string | null;
        question_text: string;
        question_type: string;
        discipline: string;
        difficulty_level: number;
        answer_input_type: string;
        marks: number;
        source_type?: string;
        model_answer_text?: string | null;
        ready_to_publish?: boolean;
        rubric: { rubric_version?: number; rubric_json: Record<string, unknown> };
      }>;
    };
  }>('/curation/items/:id/questions', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { questions?: Array<{
      id?: string;
      draft_syllabus_node_id?: string | null;
      question_text: string;
      question_type: string;
      discipline: string;
      difficulty_level: number;
      answer_input_type: string;
      marks: number;
      source_type?: string;
      model_answer_text?: string | null;
      ready_to_publish?: boolean;
      rubric: { rubric_version?: number; rubric_json: Record<string, unknown> };
    }> } | null;
    const questions = body?.questions;
    if (!Array.isArray(questions)) return reply.status(400).send({ error: 'questions array required' });
    const pool = getPool();
    const itemRes = await pool.query<{ chapter_id: string; content_type: string }>(
      'SELECT chapter_id, content_type FROM curation_items WHERE id = $1',
      [id]
    );
    if (itemRes.rows.length === 0) return reply.status(404).send({ error: 'Curation item not found' });
    if (itemRes.rows[0].content_type !== 'questions') return reply.status(400).send({ error: 'Not a questions item' });
    const chapterId = itemRes.rows[0].chapter_id;

    const existingIds = await pool.query<{ id: string }>('SELECT id FROM draft_questions WHERE chapter_id = $1', [chapterId]);
    const existingSet = new Set(existingIds.rows.map((r) => r.id));
    const payloadIds: string[] = [];

    for (const q of questions) {
      const discipline = q.discipline === 'history' || q.discipline === 'civics' ? q.discipline : 'history';
      const questionText = (q.question_text || '').slice(0, 65535);
      const questionType = (q.question_type || 'short_answer').slice(0, 80);
      const difficultyLevel = Math.min(4, Math.max(1, Number(q.difficulty_level) || 2));
      const answerInputType = q.answer_input_type === 'typed' || q.answer_input_type === 'choice' ? q.answer_input_type : 'typed';
      const marks = Math.max(1, Math.min(100, Number(q.marks) || 2));
      const sourceType = (q.source_type || 'ai_generated').slice(0, 30);
      const modelAnswerText = (q.model_answer_text ?? '').slice(0, 65535) || null;
      const readyToPublish = Boolean(q.ready_to_publish);
      const rubric = q.rubric || {};
      const rubricVersion = Number(rubric.rubric_version) || 2;
      const rubricJson = JSON.stringify(rubric.rubric_json || {});

      if (q.id && existingSet.has(q.id)) {
        await pool.query(
          `UPDATE draft_questions SET draft_syllabus_node_id = $1, question_text = $2, question_type = $3, discipline = $4, difficulty_level = $5, answer_input_type = $6, marks = $7, source_type = $8, model_answer_text = $9, ready_to_publish = $10
           WHERE id = $11 AND chapter_id = $12`,
          [q.draft_syllabus_node_id || null, questionText, questionType, discipline, difficultyLevel, answerInputType, marks, sourceType, modelAnswerText, readyToPublish, q.id, chapterId]
        );
        await pool.query(
          'UPDATE draft_rubrics SET rubric_version = $1, rubric_json = $2 WHERE draft_question_id = $3',
          [rubricVersion, rubricJson, q.id]
        );
        const rCount = await pool.query('SELECT 1 FROM draft_rubrics WHERE draft_question_id = $1', [q.id]);
        if (rCount.rows.length === 0) {
          await pool.query('INSERT INTO draft_rubrics (draft_question_id, rubric_version, rubric_json) VALUES ($1, $2, $3)', [q.id, rubricVersion, rubricJson]);
        }
        payloadIds.push(q.id);
      } else {
        const ins = await pool.query<{ id: string }>(
          `INSERT INTO draft_questions (chapter_id, draft_syllabus_node_id, question_text, question_type, discipline, difficulty_level, answer_input_type, marks, source_type, model_answer_text, ready_to_publish)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [chapterId, q.draft_syllabus_node_id || null, questionText, questionType, discipline, difficultyLevel, answerInputType, marks, sourceType, modelAnswerText, readyToPublish]
        );
        const draftQuestionId = ins.rows[0].id;
        await pool.query(
          'INSERT INTO draft_rubrics (draft_question_id, rubric_version, rubric_json) VALUES ($1, $2, $3)',
          [draftQuestionId, rubricVersion, rubricJson]
        );
        payloadIds.push(draftQuestionId);
      }
    }

    if (payloadIds.length > 0) {
      await pool.query('DELETE FROM draft_rubrics WHERE draft_question_id IN (SELECT id FROM draft_questions WHERE chapter_id = $1 AND NOT (id = ANY($2::uuid[])))', [chapterId, payloadIds]);
      await pool.query('DELETE FROM draft_questions WHERE chapter_id = $1 AND NOT (id = ANY($2::uuid[]))', [chapterId, payloadIds]);
    } else {
      await pool.query('DELETE FROM draft_rubrics WHERE draft_question_id IN (SELECT id FROM draft_questions WHERE chapter_id = $1)', [chapterId]);
      await pool.query('DELETE FROM draft_questions WHERE chapter_id = $1', [chapterId]);
    }

    await pool.query(
      "UPDATE curation_items SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    );
    const qRes = await pool.query<DraftQuestion & { rubric_version: number; rubric_json: unknown; ready_to_publish: boolean }>(
      `SELECT q.id, q.chapter_id, q.draft_syllabus_node_id, q.question_text, q.question_type, q.discipline, q.difficulty_level,
              q.answer_input_type, q.marks, q.source_type, q.model_answer_text, q.ready_to_publish, r.rubric_version, r.rubric_json
       FROM draft_questions q LEFT JOIN draft_rubrics r ON r.draft_question_id = q.id WHERE q.chapter_id = $1 ORDER BY q.id`,
      [chapterId]
    );
    const out = qRes.rows.map((r) => ({
      id: r.id,
      chapter_id: r.chapter_id,
      draft_syllabus_node_id: r.draft_syllabus_node_id,
      question_text: r.question_text,
      question_type: r.question_type,
      discipline: r.discipline,
      difficulty_level: r.difficulty_level,
      answer_input_type: r.answer_input_type,
      marks: r.marks,
      source_type: r.source_type,
      model_answer_text: r.model_answer_text,
      ready_to_publish: r.ready_to_publish ?? false,
      rubric: { rubric_version: r.rubric_version ?? 2, rubric_json: r.rubric_json ?? {} },
    }));
    return reply.send({ questions: out });
  });

  app.patch<{ Params: { id: string; questionId: string }; Body: { ready_to_publish: boolean } }>(
    '/curation/items/:id/questions/:questionId/ready',
    async (req: FastifyRequest<{ Params: { id: string; questionId: string }; Body: { ready_to_publish: boolean } }>, reply: FastifyReply) => {
      const { id, questionId } = req.params;
      const readyToPublish = Boolean((req.body as { ready_to_publish?: boolean } | null)?.ready_to_publish);
      const pool = getPool();
      const itemRes = await pool.query<{ chapter_id: string; content_type: string }>(
        'SELECT chapter_id, content_type FROM curation_items WHERE id = $1',
        [id]
      );
      if (itemRes.rows.length === 0) return reply.status(404).send({ error: 'Curation item not found' });
      if (itemRes.rows[0].content_type !== 'questions') return reply.status(400).send({ error: 'Not a questions item' });
      const chapterId = itemRes.rows[0].chapter_id;
      const up = await pool.query(
        'UPDATE draft_questions SET ready_to_publish = $1 WHERE id = $2 AND chapter_id = $3 RETURNING id',
        [readyToPublish, questionId, chapterId]
      );
      if (up.rowCount === 0) return reply.status(404).send({ error: 'Question not found' });
      return reply.send({ question_id: questionId, ready_to_publish: readyToPublish });
    }
  );

  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/curation/items/:id/status',
    async (req: FastifyRequest<{ Params: { id: string }; Body: { status: string } }>, reply: FastifyReply) => {
      const { id } = req.params;
      const status = (req.body as { status?: string } | null)?.status;
      if (!status || !['in_progress', 'ready_to_publish'].includes(status)) {
        return reply.status(400).send({ error: 'status must be in_progress or ready_to_publish' });
      }
      const pool = getPool();
      const res = await pool.query(
        "UPDATE curation_items SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status IN ('not_started', 'in_progress', 'ready_to_publish') RETURNING id",
        [status, id]
      );
      if (res.rowCount === 0) return reply.status(404).send({ error: 'Curation item not found or status not allowed' });
      return reply.send({ status });
    }
  );

  app.get<{ Params: { id: string } }>('/curation/items/:id/images', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const pool = getPool();
    const { id: itemId } = req.params;
    const check = await pool.query('SELECT id FROM curation_items WHERE id = $1', [itemId]);
    if (check.rowCount === 0) return reply.status(404).send({ error: 'Curation item not found' });
    const res = await pool.query<{ url: string; filename: string | null }>(
      'SELECT url, filename FROM curation_item_images WHERE item_id = $1 ORDER BY created_at DESC',
      [itemId]
    );
    return reply.send({ images: res.rows });
  });

  app.post('/curation/upload-image', async (req: FastifyRequest, reply: FastifyReply) => {
    let itemId: string | null = null;
    let fileData: { buffer: Buffer; mimetype: string; filename: string } | null = null;
    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'itemId') {
        itemId = (part as { value: string }).value?.trim() || null;
      }
      if (part.type === 'file' && part.fieldname === 'file') {
        const p = part as { toBuffer: () => Promise<Buffer>; mimetype: string; filename: string };
        const buffer = await p.toBuffer();
        fileData = { buffer, mimetype: p.mimetype || '', filename: p.filename || '' };
      }
    }
    if (!fileData) return reply.status(400).send({ error: 'No file uploaded' });
    const mimetype = fileData.mimetype;
    if (!ALLOWED_IMAGE_TYPES.has(mimetype)) {
      return reply.status(400).send({ error: 'Allowed types: image/jpeg, image/png, image/gif, image/webp' });
    }
    const ext = EXT_BY_MIME[mimetype] || path.extname(fileData.filename) || '.png';
    const filename = `${crypto.randomUUID()}${ext}`;
    const uploadsDir = path.join(process.cwd(), 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, fileData.buffer);
    const url = `/uploads/${filename}`;
    if (itemId) {
      const pool = getPool();
      const check = await pool.query('SELECT id FROM curation_items WHERE id = $1', [itemId]);
      if (check.rowCount === 0) return reply.status(404).send({ error: 'Curation item not found' });
      await pool.query(
        'INSERT INTO curation_item_images (item_id, url, filename) VALUES ($1, $2, $3)',
        [itemId, url, fileData.filename || filename]
      );
    }
    return reply.send({ url });
  });
}
