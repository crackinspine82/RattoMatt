#!/usr/bin/env node
/**
 * Run revision_notes migration: allow content_type 'revision_notes' on curation_items
 * and create draft_revision_note_blocks if missing.
 * Run from backend/: npm run migration:revision-notes
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const sqlPath = path.join(__dirname, 'schema-migration-revision-notes.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('Migration file not found:', sqlPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const pool = getPool();
  try {
    await pool.query(sql);
    console.log('Migration applied: curation_items now allow revision_notes; draft_revision_note_blocks ensured.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
