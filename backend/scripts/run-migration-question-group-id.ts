#!/usr/bin/env node
/**
 * Run question_group_id migration (draft_questions + questions).
 * Run from backend/: npm run migration:question-group-id
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const sqlPath = path.join(__dirname, 'schema-migration-question-group-id.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('Migration file not found:', sqlPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const pool = getPool();
  try {
    await pool.query(sql);
    console.log('Migration applied: question_group_id added to draft_questions and questions.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
