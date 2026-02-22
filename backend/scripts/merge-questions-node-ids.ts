#!/usr/bin/env node
/**
 * Merge syllabus_node_id into sample_questions_*.json (from question-bank-generate).
 * Reads syllabus_nodes for the chapter and assigns each item a node (round-robin by item index).
 * Run after structure is published. Usage: npm run curation:merge-questions-node-ids -- <chapter_id> <path-to-sample_questions_*.json>
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { getPool } from '../src/db.js';

async function main(): Promise<void> {
  const chapterId = process.argv[2]?.trim();
  const filePath = process.argv[3]?.trim();
  if (!chapterId || !filePath) {
    console.error('Usage: npm run curation:merge-questions-node-ids -- <chapter_id> <path-to-sample_questions_*.json>');
    process.exit(1);
  }
  const absPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) {
    console.error('File not found:', absPath);
    process.exit(1);
  }

  const pool = getPool();
  const nodes = await pool.query<{ id: string }>(
    `WITH RECURSIVE tree AS (
      SELECT id, ARRAY[sequence_number] AS sort_path
      FROM syllabus_nodes
      WHERE chapter_id = $1 AND parent_id IS NULL
      UNION ALL
      SELECT n.id, t.sort_path || n.sequence_number
      FROM syllabus_nodes n
      JOIN tree t ON n.parent_id = t.id
    )
    SELECT id FROM tree ORDER BY sort_path`,
    [chapterId]
  );
  if (nodes.rows.length === 0) {
    console.error('No published syllabus nodes for chapter', chapterId, '- publish structure first.');
    process.exit(1);
  }

  const raw = fs.readFileSync(absPath, 'utf8');
  const data = JSON.parse(raw) as { items?: Array<{ syllabus_node_id?: string; question_type?: string; questions?: unknown[] }> };
  const items = data.items ?? [];
  const nodeIds = nodes.rows.map((r) => r.id);
  for (let i = 0; i < items.length; i++) {
    items[i].syllabus_node_id = nodeIds[i % nodeIds.length];
  }
  fs.writeFileSync(absPath, JSON.stringify(data, null, 2), 'utf8');
  console.log('Merged syllabus_node_id into', items.length, 'items in', absPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
