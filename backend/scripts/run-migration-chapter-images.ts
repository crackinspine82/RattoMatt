#!/usr/bin/env node
/**
 * Run chapter-images migration: curation_chapter_images + curation_chapter_image_nodes.
 * Run from backend/: npm run migration:chapter-images
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const sqlPath = path.join(__dirname, 'schema-migration-chapter-images.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('Migration file not found:', sqlPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const pool = getPool();
  try {
    await pool.query(sql);
    console.log('Migration applied: curation_chapter_images and curation_chapter_image_nodes created.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
