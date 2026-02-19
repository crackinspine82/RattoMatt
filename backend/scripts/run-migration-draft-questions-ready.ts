#!/usr/bin/env node
/**
 * Run draft_questions.ready_to_publish migration (CURATION_SPEC).
 * Run from backend/: npm run migration:draft-questions-ready
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const sqlPath = path.join(__dirname, 'schema-migration-draft-questions-ready.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('Migration file not found:', sqlPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const pool = getPool();
  try {
    await pool.query(sql);
    console.log('Migration applied: draft_questions.ready_to_publish added.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
