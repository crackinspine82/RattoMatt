/**
 * Add progress and ETA columns to admin_jobs.
 * From backend/: npm run migration:admin-progress
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, 'schema-migration-admin-progress.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('Schema file not found:', sqlPath);
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url });
  try {
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('Admin progress migration applied.');
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
