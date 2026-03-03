#!/usr/bin/env node
/**
 * Run question_sub_part_nodes migration: create tables and backfill structured_essay from syllabus_node_id.
 * Run from backend/: npm run migration:question-sub-part-nodes
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const sqlPath = path.join(__dirname, 'schema-migration-question-sub-part-nodes.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('Migration file not found:', sqlPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const pool = getPool();
  try {
    await pool.query(sql);
    console.log('Tables created: draft_question_sub_part_nodes, question_sub_part_nodes.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }

  // Backfill: for draft_questions with question_type = 'structured_essay' and syllabus_node_id set,
  // insert (i), (ii), (iii) rows so existing data is preserved.
  try {
    const draftRes = await pool.query<{ id: string; syllabus_node_id: string }>(
      `SELECT id, syllabus_node_id FROM draft_questions WHERE question_type = 'structured_essay' AND syllabus_node_id IS NOT NULL`
    );
    let backfillDraft = 0;
    for (const row of draftRes.rows) {
      const existing = await pool.query(
        'SELECT 1 FROM draft_question_sub_part_nodes WHERE draft_question_id = $1 LIMIT 1',
        [row.id]
      );
      if (existing.rows.length > 0) continue;
      for (const key of ['i', 'ii', 'iii']) {
        await pool.query(
          `INSERT INTO draft_question_sub_part_nodes (draft_question_id, sub_part_key, syllabus_node_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (draft_question_id, sub_part_key) DO NOTHING`,
          [row.id, key, row.syllabus_node_id]
        );
        backfillDraft++;
      }
    }
    if (backfillDraft > 0) console.log('Backfilled draft_question_sub_part_nodes:', backfillDraft, 'rows.');

    const pubRes = await pool.query<{ id: string; syllabus_node_id: string }>(
      `SELECT id, syllabus_node_id FROM questions WHERE question_type = 'structured_essay' AND syllabus_node_id IS NOT NULL`
    );
    let backfillPub = 0;
    for (const row of pubRes.rows) {
      const existing = await pool.query(
        'SELECT 1 FROM question_sub_part_nodes WHERE question_id = $1 LIMIT 1',
        [row.id]
      );
      if (existing.rows.length > 0) continue;
      for (const key of ['i', 'ii', 'iii']) {
        await pool.query(
          `INSERT INTO question_sub_part_nodes (question_id, sub_part_key, syllabus_node_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (question_id, sub_part_key) DO NOTHING`,
          [row.id, key, row.syllabus_node_id]
        );
        backfillPub++;
      }
    }
    if (backfillPub > 0) console.log('Backfilled question_sub_part_nodes:', backfillPub, 'rows.');
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exit(1);
  }

  console.log('Migration applied: question_sub_part_nodes.');
}

main();
