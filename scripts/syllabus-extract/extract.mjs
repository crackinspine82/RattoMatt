#!/usr/bin/env node
/**
 * Syllabus extraction: walk Books/ICSE/{grade}/{subject}/{book_slug}/,
 * call Gemini per chapter PDF, merge to one syllabus JSON per book.
 * Requires: GEMINI_API_KEY in env (or in .env in this folder). See docs/syllabus_extraction_prompt.md.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DOCS = path.join(ROOT, 'docs');
const BOOKS = path.join(ROOT, 'Books', 'ICSE');
const OUT_DIR = path.join(__dirname, 'out');
/** Delay between chapter API calls to avoid 429 rate limit (ms). */
const DELAY_BETWEEN_CHAPTERS_MS = 2500;
/** Max retries per chapter on failure (e.g. 429). */
const MAX_RETRIES = 3;
/** Base delay before retry on 429 (ms); doubled each retry. */
const RETRY_DELAY_BASE_MS = 8000;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function is429(err) {
  const msg = String(err?.message ?? err ?? '');
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) return true;
  try {
    const obj = typeof err?.message === 'string' && err.message.startsWith('{') ? JSON.parse(err.message) : err;
    return obj?.error?.code === 429 || obj?.error?.status === 'RESOURCE_EXHAUSTED';
  } catch {
    return false;
  }
}

const LEVEL_LABELS = ['Section', 'Topic', 'Subtopic', 'Point', 'Sub-point'];

const PROMPT_TEMPLATE = `You are extracting syllabus structure from a textbook chapter PDF for an Indian board (board: {BOARD}, grade: {GRADE}, subject: {SUBJECT}).

This PDF is chapter {CHAPTER_NUMBER}: "{CHAPTER_TITLE}". {DISCIPLINE_LINE}

Output a single JSON object with this exact structure. No other text, no markdown code fences, no explanation. Only valid JSON.

{
  "chapter_title": "<string, may refine from PDF>",
  "sequence_number": {CHAPTER_NUMBER},
  "discipline": "<string or null: 'history' | 'civics' only for HistoryCivics; null for other subjects>",
  "nodes": [
    {
      "title": "<string>",
      "sequence_number": <number>,
      "depth": 0,
      "level_label": "Section",
      "children": [
        {
          "title": "<string>",
          "sequence_number": <number>,
          "depth": 1,
          "level_label": "Topic",
          "children": [
            { "title": "<string>", "sequence_number": <number>, "depth": 2, "level_label": "Subtopic", "children": [] }
          ]
        }
      ]
    }
  ],
  "structure_notes": "<optional brief note on how the chapter is organized, or empty string>"
}

Hierarchy rules (critical):
- Use unlimited nesting. Each node has: title, sequence_number (1-based among siblings), depth (0 = top-level Section, 1 = Topic, 2 = Subtopic, 3 = Point, 4+ = Sub-point), level_label (exactly: "Section"|"Topic"|"Subtopic"|"Point"|"Sub-point"), and children (array of child nodes; use [] when no children).
- depth 0 = Section (main headings), depth 1 = Topic, depth 2 = Subtopic, depth 3 = Point, depth 4 or more = Sub-point. Set level_label to "Sub-point" for any depth >= 4.
- Preserve PDF order and indentation: what appears as a sub-heading under another in the PDF must be a child in the tree, not a sibling.
- Example: If the book has "SOURCES" (big heading) then "Tirukkural", "Megaliths" (sub-items), create one node with title "SOURCES", depth 0, level_label "Section", children: [ { title: "Tirukkural", depth 1, level_label: "Topic", children: [] }, { title: "Megaliths", ... } ]. If "Tirukkural" has sub-points, add them as children of that node with depth 2, level_label "Subtopic".
- sequence_number is 1-based within the same parent (siblings only).

Rules:
- Infer structure from headings, font size, indentation, and numbering in the PDF. Preserve order as information appears in the PDF.
- Chapter sequence_number is {CHAPTER_NUMBER}. For History & Civics, set discipline to "history" or "civics". For other subjects, set discipline to null.
- If the chapter has no clear sub-structure, use one root node (depth 0) with title same as chapter and children from main points.
- Output only the JSON object.
`;

function loadPublications() {
  const p = path.join(DOCS, 'icse_publications.json');
  const raw = fs.readFileSync(p, 'utf8');
  const data = JSON.parse(raw);
  return data.publications || [];
}

/**
 * Get --book=book_slug from argv or BOOK_SLUG from env. Returns null if not set.
 */
function getBookFilter() {
  const env = process.env.BOOK_SLUG?.trim();
  if (env) return env;
  const arg = process.argv.find((a) => a.startsWith('--book='));
  if (arg) return arg.slice('--book='.length).trim();
  return null;
}

function getBookFolders() {
  const bookFilter = getBookFilter();
  const publications = loadPublications();
  const folders = [];
  for (const pub of publications) {
    if (bookFilter && pub.book_slug !== bookFilter) continue;
    const dir = path.join(BOOKS, String(pub.grade), pub.subject, pub.book_slug);
    if (fs.existsSync(dir)) {
      folders.push({ pub, dir });
    }
  }
  return folders;
}

/**
 * Parse chapter filename: "N - Title.pdf" or "Discipline_N - Title.pdf".
 * Returns { sequenceNumber, discipline?, title } or null if not a chapter PDF.
 */
function parseChapterFilename(name) {
  if (!name.endsWith('.pdf')) return null;
  if (name.startsWith('Cover')) return null;
  const base = name.slice(0, -4).trim();
  const dashIdx = base.indexOf(' - ');
  if (dashIdx === -1) return null;
  const left = base.slice(0, dashIdx).trim();
  const title = base.slice(dashIdx + 3).trim();
  const multiMatch = left.match(/^([A-Za-z]+)_(\d+)$/);
  if (multiMatch) {
    return { sequenceNumber: parseInt(multiMatch[2], 10), discipline: multiMatch[1].toLowerCase(), title };
  }
  const numMatch = left.match(/^(\d+)$/);
  if (numMatch) {
    return { sequenceNumber: parseInt(numMatch[1], 10), discipline: null, title };
  }
  return null;
}

function listChapterPdfs(dir) {
  const names = fs.readdirSync(dir);
  const entries = [];
  for (const name of names) {
    const parsed = parseChapterFilename(name);
    if (parsed) entries.push({ name, ...parsed });
  }
  entries.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return entries;
}

function buildPrompt(pub, chapterNumber, chapterTitle, disciplineFromFilename) {
  const board = 'ICSE';
  const grade = String(pub.grade);
  const subject = pub.subject;
  let disciplineLine = '';
  if (subject === 'HistoryCivics' && disciplineFromFilename) {
    disciplineLine = `This chapter belongs to discipline: ${disciplineFromFilename}. Set "discipline" in the JSON to "${disciplineFromFilename}".`;
  }
  return PROMPT_TEMPLATE.replace(/{BOARD}/g, board)
    .replace(/{GRADE}/g, grade)
    .replace(/{SUBJECT}/g, subject)
    .replace(/{CHAPTER_NUMBER}/g, String(chapterNumber))
    .replace(/{CHAPTER_TITLE}/g, chapterTitle)
    .replace(/{DISCIPLINE_LINE}/g, disciplineLine);
}

function extractJsonFromResponse(text) {
  const trimmed = text.trim();
  let jsonStr = trimmed;
  const codeFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```/);
  if (codeFence) jsonStr = codeFence[1].trim();
  return JSON.parse(jsonStr);
}

/** Ensure each node has depth and level_label; normalize from depth if needed. */
function normalizeNodes(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((n, i) => {
    const depth = typeof n.depth === 'number' ? n.depth : 0;
    const levelLabel = n.level_label || LEVEL_LABELS[Math.min(depth, LEVEL_LABELS.length - 1)];
    const children = normalizeNodes(n.children);
    return {
      title: n.title || '',
      sequence_number: n.sequence_number ?? i + 1,
      depth,
      level_label: levelLabel,
      children,
    };
  });
}

/** Convert legacy topics[] + micro_topics[] into nodes tree (depth 0 = Section, depth 1 = Topic). */
function convertTopicsToNodes(topics) {
  return (topics || []).map((t, i) => ({
    title: t.title || '',
    sequence_number: t.sequence_number ?? i + 1,
    depth: 0,
    level_label: 'Section',
    children: (t.micro_topics || []).map((m, j) => ({
      title: m.title || '',
      sequence_number: m.sequence_number ?? j + 1,
      depth: 1,
      level_label: 'Topic',
      children: [],
    })),
  }));
}

async function callGemini(apiKey, pdfPath, prompt) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const pdfBuffer = fs.readFileSync(pdfPath);
  const base64 = pdfBuffer.toString('base64');
  const contents = [
    { text: prompt },
    { inlineData: { mimeType: 'application/pdf', data: base64 } },
  ];
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents,
  });
  const text = response?.text ?? response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error('Empty response from Gemini');
  return extractJsonFromResponse(text);
}

async function processBook({ pub, dir }, options = {}) {
  const { dryRun = false } = options;
  const chapters = listChapterPdfs(dir);
  if (chapters.length === 0) {
    console.log(`  No chapter PDFs in ${dir}`);
    return null;
  }
  console.log(`  ${chapters.length} chapter(s): ${chapters.map((c) => c.name).join(', ')}`);
  const syllabus = {
    board: 'ICSE',
    grade: pub.grade,
    subject: pub.subject,
    book_slug: pub.book_slug,
    book_meta: {
      book_name: pub.book_name,
      publication: pub.publication,
      author: pub.author,
    },
    chapters: [],
  };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && !dryRun) {
    console.warn('  GEMINI_API_KEY not set; skipping Gemini calls. Use --dry-run to only list files.');
    return dryRun ? null : syllabus;
  }
  for (const entry of chapters) {
    const pdfPath = path.join(dir, entry.name);
    const prompt = buildPrompt(pub, entry.sequenceNumber, entry.title, entry.discipline || undefined);
    if (dryRun) {
      console.log(`  [dry] Would process: ${entry.name}`);
      continue;
    }
    let result = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        result = await callGemini(apiKey, pdfPath, prompt);
        break;
      } catch (err) {
        const rateLimited = is429(err);
        if (attempt < MAX_RETRIES && rateLimited) {
          const waitMs = RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1);
          console.log(`  429 rate limit → retry ${attempt}/${MAX_RETRIES} in ${waitMs / 1000}s: ${entry.name}`);
          await delay(waitMs);
        } else {
          if (!rateLimited || attempt === MAX_RETRIES) {
            console.error(`  FAIL: ${entry.name}`, err.message);
          }
          break;
        }
      }
    }
    if (result) {
      const nodes = result.nodes != null ? normalizeNodes(result.nodes) : convertTopicsToNodes(result.topics || []);
      syllabus.chapters.push({
        title: result.chapter_title || entry.title,
        sequence_number: result.sequence_number ?? entry.sequenceNumber,
        discipline: result.discipline ?? entry.discipline ?? null,
        nodes,
        structure_notes: result.structure_notes || '',
      });
      console.log(`  OK: ${entry.name}`);
    }
    await delay(DELAY_BETWEEN_CHAPTERS_MS);
  }
  syllabus.chapters.sort((a, b) => a.sequence_number - b.sequence_number);
  return syllabus;
}

function writeSyllabus(syllabus) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const filename = `syllabus_${syllabus.board}_${syllabus.grade}_${syllabus.subject}_${syllabus.book_slug}.json`;
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(syllabus, null, 2), 'utf8');
  console.log(`  Wrote ${outPath}`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const bookFilter = getBookFilter();
  if (dryRun) console.log('Dry run: listing only, no Gemini calls.\n');
  if (bookFilter) console.log(`Filtering to book_slug: ${bookFilter}\n`);
  const folders = getBookFolders();
  if (folders.length === 0) {
    console.log('No book folder(s) found for the filter. Check BOOK_SLUG/--book or that Books/ICSE/{grade}/{subject}/{book_slug}/ exists.');
    return;
  }
  if (!dryRun && !process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set. Set it in scripts/syllabus-extract/.env or in your shell.');
    process.exit(1);
  }
  if (!dryRun) console.log('GEMINI_API_KEY is set. Starting extraction.\n');
  console.log(`Found ${folders.length} book folder(s) with PDFs.\n`);
  for (const folder of folders) {
    const { pub } = folder;
    console.log(`${pub.subject} grade ${pub.grade} / ${pub.book_slug}`);
    const syllabus = await processBook(folder, { dryRun });
    if (syllabus && syllabus.chapters.length > 0) {
      writeSyllabus(syllabus);
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
