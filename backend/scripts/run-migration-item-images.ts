#!/usr/bin/env node
/**
 * Run item-images migration: create curation_item_images for chapter image repository.
 * Run from backend/: npm run migration:item-images
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const sqlPath = path.join(__dirname, 'schema-migration-item-images.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('Migration file not found:', sqlPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const pool = getPool();
  try {
    await pool.query(sql);
    console.log('Migration applied: curation_item_images created.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
