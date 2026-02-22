#!/usr/bin/env node
/**
 * Run syllabus_node_id migration: draft_revision_note_blocks and draft_questions
 * keyed by syllabus_node_id (published). Requires empty or truncated draft tables.
 * Run from backend/: npm run migration:syllabus-node-id
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const sqlPath = path.join(__dirname, 'schema-migration-syllabus-node-id.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('Migration file not found:', sqlPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const pool = getPool();
  try {
    await pool.query(sql);
    console.log('Migration applied: draft_revision_note_blocks and draft_questions use syllabus_node_id; revision_note_blocks table ensured.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
