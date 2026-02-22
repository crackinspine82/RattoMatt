#!/usr/bin/env node
/**
 * Merge syllabus_node_id into study_notes_*.json (from study-notes-generate).
 * Reads syllabus_nodes for the chapter in tree order and assigns section[i].syllabus_node_id = nodes[i].id.
 * Run after structure is published. Usage: npm run curation:merge-revision-node-ids -- <chapter_id> <path-to-study_notes_*.json>
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { getPool } from '../src/db.js';

async function main(): Promise<void> {
  const chapterId = process.argv[2]?.trim();
  const filePath = process.argv[3]?.trim();
  if (!chapterId || !filePath) {
    console.error('Usage: npm run curation:merge-revision-node-ids -- <chapter_id> <path-to-study_notes_*.json>');
    process.exit(1);
  }
  const absPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) {
    console.error('File not found:', absPath);
    process.exit(1);
  }

  const pool = getPool();
  const nodes = await pool.query<{ id: string; title: string }>(
    `WITH RECURSIVE tree AS (
      SELECT id, title, ARRAY[sequence_number] AS sort_path
      FROM syllabus_nodes
      WHERE chapter_id = $1 AND parent_id IS NULL
      UNION ALL
      SELECT n.id, n.title, t.sort_path || n.sequence_number
      FROM syllabus_nodes n
      JOIN tree t ON n.parent_id = t.id
    )
    SELECT id, title FROM tree ORDER BY sort_path`,
    [chapterId]
  );
  if (nodes.rows.length === 0) {
    console.error('No published syllabus nodes for chapter', chapterId, '- publish structure first.');
    process.exit(1);
  }

  const raw = fs.readFileSync(absPath, 'utf8');
  const data = JSON.parse(raw) as { sections?: Array<{ title?: string; level_label?: string; content_md?: string; syllabus_node_id?: string }> };
  const sections = data.sections ?? [];
  for (let i = 0; i < sections.length; i++) {
    const node = nodes.rows[i];
    sections[i].syllabus_node_id = node ? node.id : undefined;
  }
  fs.writeFileSync(absPath, JSON.stringify(data, null, 2), 'utf8');
  console.log('Merged', Math.min(sections.length, nodes.rows.length), 'syllabus_node_id(s) into', absPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
