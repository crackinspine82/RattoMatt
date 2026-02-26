#!/usr/bin/env node
/**
 * Backfill chapters.page_count from chapter PDFs under Books/ICSE.
 * Resolves chapter → publication (icse_publications.json) → PDF path; counts pages in-process with pdf-lib.
 * Run from backend/: npm run backfill:page-counts [-- --dry-run] [-- --chapter-id=uuid]
 * Or filter by: --grade=N --book=slug --chapter=N [--discipline=history|civics]
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../src/db.js';
import { PDFDocument } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_DIR, '..');
const BOOKS_BASE = path.join(REPO_ROOT, 'Books', 'ICSE');
const PUBLICATIONS_PATH = path.join(REPO_ROOT, 'docs', 'icse_publications.json');

type Publication = { grade: number; subject: string; book_slug: string; book_name: string };
type PdfEntry = { name: string; sequenceNumber: number; discipline: string | null; title: string };
type ChapterRow = {
  id: string;
  sequence_number: number;
  discipline: string | null;
  grade_level: number;
  subject_name: string;
  title: string;
};

function getArg(name: string): string | null {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return null;
  return arg.slice(`--${name}=`.length).trim() || null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function loadPublications(): Publication[] {
  const raw = fs.readFileSync(PUBLICATIONS_PATH, 'utf8');
  const data = JSON.parse(raw) as { publications?: Publication[] };
  return data.publications ?? [];
}

/** Same logic as study-notes-generate: parse "N - Title.pdf" or "Discipline_N - Title.pdf". */
function parseChapterFilename(name: string): PdfEntry | null {
  if (!name.endsWith('.pdf')) return null;
  if (name.startsWith('Cover')) return null;
  const base = name.slice(0, -4).trim();
  const dashIdx = base.indexOf(' - ');
  if (dashIdx === -1) return null;
  const left = base.slice(0, dashIdx).trim();
  const title = base.slice(dashIdx + 3).trim();
  const multiMatch = left.match(/^([A-Za-z]+)_(\d+)$/);
  if (multiMatch) {
    return {
      name,
      sequenceNumber: parseInt(multiMatch[2], 10),
      discipline: multiMatch[1].toLowerCase(),
      title,
    };
  }
  const numMatch = left.match(/^(\d+)$/);
  if (numMatch) {
    return {
      name,
      sequenceNumber: parseInt(numMatch[1], 10),
      discipline: null,
      title,
    };
  }
  return null;
}

function listChapterPdfs(dir: string): PdfEntry[] {
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir);
  const entries: PdfEntry[] = [];
  for (const name of names) {
    const parsed = parseChapterFilename(name);
    if (parsed) entries.push(parsed);
  }
  entries.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return entries;
}

function findPdfForChapter(booksDir: string, pub: Publication, chapter: ChapterRow): string | null {
  const dir = path.join(booksDir, String(pub.grade), pub.subject, pub.book_slug);
  const pdfs = listChapterPdfs(dir);
  const match = pdfs.find(
    (p) =>
      p.sequenceNumber === chapter.sequence_number &&
      (p.discipline ?? null) === (chapter.discipline ?? null)
  );
  return match ? path.join(dir, match.name) : null;
}

async function countPdfPages(pdfPath: string): Promise<number> {
  const buf = fs.readFileSync(pdfPath);
  const doc = await PDFDocument.load(buf);
  return doc.getPageCount();
}

async function main(): Promise<void> {
  const dryRun = hasFlag('dry-run');
  const chapterIdArg = getArg('chapter-id');
  const gradeArg = getArg('grade');
  const bookArg = getArg('book');
  const chapterNumArg = getArg('chapter');
  const disciplineArg = getArg('discipline');

  const pool = getPool();

  let chapters: ChapterRow[];
  if (chapterIdArg) {
    const res = await pool.query<ChapterRow>(
      `SELECT c.id, c.sequence_number, c.discipline, c.title,
              s.grade_level, s.name AS subject_name
       FROM chapters c
       JOIN subjects s ON s.id = c.subject_id
       WHERE c.id = $1`,
      [chapterIdArg]
    );
    if (res.rows.length === 0) {
      console.error('Chapter not found for --chapter-id=', chapterIdArg);
      process.exit(1);
    }
    chapters = res.rows;
  } else if (gradeArg && bookArg && chapterNumArg) {
    const grade = parseInt(gradeArg, 10);
    const chapterNum = parseInt(chapterNumArg, 10);
    if (!Number.isFinite(grade) || !Number.isFinite(chapterNum)) {
      console.error('--grade and --chapter must be numbers.');
      process.exit(1);
    }
    const pubs = loadPublications().filter((p) => p.grade === grade && p.book_slug === bookArg);
    if (pubs.length === 0) {
      console.error('No publication found for grade', grade, 'book', bookArg);
      process.exit(1);
    }
    const subjectName = pubs[0].book_name;
    const res = await pool.query<ChapterRow>(
      `SELECT c.id, c.sequence_number, c.discipline, c.title,
              s.grade_level, s.name AS subject_name
       FROM chapters c
       JOIN subjects s ON s.id = c.subject_id
       WHERE s.grade_level = $1 AND s.name = $2 AND c.sequence_number = $3
         AND (c.discipline IS NOT DISTINCT FROM $4)`,
      [grade, subjectName, chapterNum, disciplineArg ?? null]
    );
    if (res.rows.length === 0) {
      console.error('Chapter not found in DB for grade/book/chapter/discipline.');
      process.exit(1);
    }
    chapters = res.rows;
  } else {
    const res = await pool.query<ChapterRow>(
      `SELECT c.id, c.sequence_number, c.discipline, c.title,
              s.grade_level, s.name AS subject_name
       FROM chapters c
       JOIN subjects s ON s.id = c.subject_id
       ORDER BY s.grade_level, s.name, c.sequence_number, c.discipline NULLS FIRST`
    );
    chapters = res.rows;
  }

  const publications = loadPublications();
  if (publications.length === 0) {
    console.error('No publications in', PUBLICATIONS_PATH);
    process.exit(1);
  }


  if (dryRun) {
    console.log('Dry run: no updates will be written.\n');
  }

  let updated = 0;
  let skipped = 0;

  for (const ch of chapters) {
    const pub = publications.find(
      (p) => p.grade === ch.grade_level && p.book_name === ch.subject_name
    );
    if (!pub) {
      console.warn(`Skip: no publication for chapter ${ch.id} (${ch.subject_name} grade ${ch.grade_level}).`);
      skipped++;
      continue;
    }

    const pdfPath = findPdfForChapter(BOOKS_BASE, pub, ch);
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      console.warn(`Skip: no PDF found for chapter ${ch.id} (${ch.title}, ${ch.sequence_number} ${ch.discipline ?? 'no discipline'}).`);
      skipped++;
      continue;
    }

    let pageCount: number;
    try {
      pageCount = await countPdfPages(pdfPath);
    } catch (err) {
      console.warn(`Skip: could not count pages for ${pdfPath}:`, (err as Error).message);
      skipped++;
      continue;
    }

    if (pageCount < 1) {
      console.warn(`Skip: page count 0 for ${pdfPath}.`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`Would set chapter ${ch.id} (${ch.title}) → page_count = ${pageCount} (from ${path.basename(pdfPath)})`);
    } else {
      await pool.query('UPDATE chapters SET page_count = $1 WHERE id = $2', [pageCount, ch.id]);
      console.log(`Updated chapter ${ch.id} (${ch.title}) → page_count = ${pageCount}`);
    }
    updated++;
  }

  console.log('\nDone:', updated, 'updated', skipped, 'skipped.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
