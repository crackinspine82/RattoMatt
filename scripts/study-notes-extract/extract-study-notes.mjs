#!/usr/bin/env node
/**
 * Study notes extraction: for each chapter PDF, load syllabus (nodes tree),
 * reconcile outline, extract notes per syllabus node (content_blocks). Does NOT
 * overwrite syllabus; PDF-only sections stay in reconciliation.additional_sections.
 *
 * Supports syllabus with chapters[].nodes (nested) or legacy chapters[].topics.
 * Requires: GEMINI_API_KEY. Syllabus JSONs in ../syllabus-extract/out/.
 * Run: node extract-study-notes.mjs [--book=slug] [--chapter=N] [--discipline=history|civics] [--dry-run]
 * Optional env: GEMINI_MODEL (default gemini-2.0-flash; use gemini-2.0-pro or gemini-2.5-pro for higher quality).
 *
 * Output per chapter:
 *   - notes_ICSE_{grade}_{subject}_{book_slug}_Ch{N}[_{discipline}].json
 *   - notes_manifest_ICSE_{...}_Ch{N}[_{discipline}].json (syllabus_leaves, stray_leaves)
 * Seed via backend seed-from-study-notes.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DOCS = path.join(ROOT, 'docs');
const BOOKS = path.join(ROOT, 'Books', 'ICSE');
const SYLLABUS_OUT = path.join(__dirname, '../syllabus-extract/out');
const OUT_DIR = path.join(__dirname, 'out');

const DELAY_MS = 3000;
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE_MS = 8000;

function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function is429(err) {
  const msg = String(err?.message ?? err ?? '');
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
}

function loadPublications() {
  const p = path.join(DOCS, 'icse_publications.json');
  const raw = fs.readFileSync(p, 'utf8');
  const data = JSON.parse(raw);
  return data.publications || [];
}

function getBookFilter() {
  const env = process.env.BOOK_SLUG?.trim();
  if (env) return env;
  const arg = process.argv.find((a) => a.startsWith('--book='));
  if (arg) return arg.slice('--book='.length).trim();
  return null;
}

function getChapterFilter() {
  const arg = process.argv.find((a) => a.startsWith('--chapter='));
  if (!arg) return null;
  const n = parseInt(arg.slice('--chapter='.length).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function getDisciplineFilter() {
  const arg = process.argv.find((a) => a.startsWith('--discipline='));
  if (!arg) return null;
  const d = arg.slice('--discipline='.length).trim().toLowerCase();
  return d === 'history' || d === 'civics' ? d : null;
}

function getBookFolders() {
  const bookFilter = getBookFilter();
  const publications = loadPublications();
  const folders = [];
  for (const pub of publications) {
    if (bookFilter && pub.book_slug !== bookFilter) continue;
    const dir = path.join(BOOKS, String(pub.grade), pub.subject, pub.book_slug);
    if (fs.existsSync(dir)) folders.push({ pub, dir });
  }
  return folders;
}

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

function getSyllabusPath(pub) {
  const filename = `syllabus_ICSE_${pub.grade}_${pub.subject}_${pub.book_slug}.json`;
  return path.join(SYLLABUS_OUT, filename);
}

function loadSyllabusForBook(pub) {
  const p = getSyllabusPath(pub);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

/** Match syllabus chapter by sequence_number and discipline (for HistoryCivics). */
function findSyllabusChapter(syllabus, pdfEntry) {
  const chs = syllabus.chapters || [];
  for (let i = 0; i < chs.length; i++) {
    const ch = chs[i];
    const seqMatch = ch.sequence_number === pdfEntry.sequenceNumber;
    const discMatch = (ch.discipline || null) === (pdfEntry.discipline || null);
    if (seqMatch && discMatch) return { chapter: ch, index: i };
  }
  return null;
}

const LEVEL_LABELS = ['Section', 'Topic', 'Subtopic', 'Point', 'Sub-point'];

/** Get nodes from chapter; convert legacy topics to nodes if needed. */
function getChapterNodes(chapter) {
  if (chapter.nodes && Array.isArray(chapter.nodes)) return chapter.nodes;
  const topics = chapter.topics || [];
  return topics.map((t, i) => ({
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

/** Flatten node tree to list in DFS order: [{ title, depth, level_label }, ...]. */
function flattenNodes(nodes) {
  const out = [];
  function walk(ns) {
    if (!Array.isArray(ns)) return;
    for (const n of ns) {
      out.push({ title: n.title, depth: n.depth ?? 0, level_label: n.level_label || 'Section' });
      walk(n.children);
    }
  }
  walk(nodes);
  return out;
}

/** Count leaf nodes (no children) in the tree. */
function countLeaves(nodes) {
  if (!Array.isArray(nodes)) return 0;
  let n = 0;
  for (const node of nodes) {
    if (!node.children || node.children.length === 0) n += 1;
    else n += countLeaves(node.children);
  }
  return n;
}

/** Build tree from flat list with depth (DFS order). Each item { title, depth, level_label }. */
function unflattenToTree(flatList) {
  const root = { children: [] };
  const stack = [{ node: root, depth: -1 }];
  for (const item of flatList) {
    const { title, depth, level_label } = item;
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1].node;
    const child = {
      title: title || '',
      sequence_number: (parent.children?.length ?? 0) + 1,
      depth,
      level_label: level_label || LEVEL_LABELS[Math.min(depth, LEVEL_LABELS.length - 1)],
      children: [],
    };
    if (!parent.children) parent.children = [];
    parent.children.push(child);
    stack.push({ node: child, depth });
  }
  return root.children || [];
}

/** Strip markdown code fence (match anywhere in text, not only at start). */
function stripCodeFence(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : trimmed;
}

/** Escape control characters inside JSON double-quoted strings so JSON.parse succeeds. */
function sanitizeJsonControlChars(str) {
  let inString = false;
  let escapeNext = false;
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escapeNext) {
      result += c;
      escapeNext = false;
      continue;
    }
    if (c === '\\' && inString) {
      result += c;
      escapeNext = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      result += c;
      continue;
    }
    if (inString) {
      const code = c.charCodeAt(0);
      if (c === '\n') result += '\\n';
      else if (c === '\r') result += '\\r';
      else if (c === '\t') result += '\\t';
      else if (code < 32) result += '\\u' + ('0000' + code.toString(16)).slice(-4);
      else result += c;
      continue;
    }
    result += c;
  }
  return result;
}

function extractJsonFromResponse(text) {
  let jsonStr = stripCodeFence(text);
  jsonStr = sanitizeJsonControlChars(jsonStr);
  return JSON.parse(jsonStr);
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
  const model = getGeminiModel();
  const response = await ai.models.generateContent({
    model,
    contents,
  });
  const text = response?.text ?? response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error('Empty response from Gemini');
  return extractJsonFromResponse(text);
}

/** Collect all leaf nodes (no children) with path and has_notes. */
function collectSyllabusLeaves(nodes, pathPrefix = []) {
  const leaves = [];
  if (!Array.isArray(nodes)) return leaves;
  for (const n of nodes) {
    const pathTitles = [...pathPrefix, n.title];
    const path = pathTitles.join(' > ');
    const hasNotes = Array.isArray(n.content_blocks) && n.content_blocks.some((b) => (b?.content_md || '').trim().length > 0);
    if (!n.children || n.children.length === 0) {
      leaves.push({
        path,
        path_titles: pathTitles,
        title: n.title,
        sequence_number: n.sequence_number,
        depth: n.depth ?? pathPrefix.length,
        level_label: n.level_label || 'Section',
        has_notes: hasNotes,
      });
    } else {
      leaves.push(...collectSyllabusLeaves(n.children, pathTitles));
    }
  }
  return leaves;
}

/** Build stray_leaves from in_pdf_only and additional_sections (content exists = has_notes). */
function buildStrayLeaves(inPdfOnly, additionalSections) {
  const byTitle = new Map();
  for (const s of additionalSections || []) {
    const hasContent = (s.content_md || '').trim().length > 0;
    byTitle.set((s.title || '').trim(), hasContent);
  }
  return (inPdfOnly || []).map((item) => ({
    title: item.title || '',
    insert_after_index: item.insert_after_index ?? 0,
    micro_topics: item.micro_topics || [],
    has_notes: byTitle.has((item.title || '').trim()) && byTitle.get((item.title || '').trim()),
  }));
}

function buildReconciliationPrompt(pub, chapterTitle, chapterDiscipline, flatSyllabusList) {
  const syllabusList = flatSyllabusList.map((item) => `  ${item.depth + 1}. ${'  '.repeat(item.depth)}${item.title}`).join('\n');

  return `You are analyzing a textbook chapter PDF for an Indian board (ICSE grade ${pub.grade}, subject: ${pub.subject}).
This PDF is chapter: "${chapterTitle}".${chapterDiscipline ? ` Discipline: ${chapterDiscipline}.` : ''}

CURRENT SYLLABUS for this chapter (outline in order; indentation = depth):
${syllabusList || '  (empty)'}

Do the following and output a single JSON object only. No markdown fences, no explanation.

Match syllabus titles to PDF sections by meaning and wording, not only exact text. Ensure outline order matches the PDF page order.

1) List every section and subsection heading in the PDF in reading order (outline).
2) Compare the PDF outline to the syllabus. Report:
   - in_syllabus_only: array of syllabus titles that have NO clear match in the PDF.
   - in_pdf_only: array of PDF section titles not in the syllabus. For each: title, insert_after_index (0-based index in the syllabus list AFTER which to insert; 0 = before first), micro_topics (array of sub-section titles under this section, if any). Do NOT include Exercise, Practice Questions, Revision Questions, or any similar question/practice sections in in_pdf_only.
3) For each item in in_pdf_only, extract the full study note content from the PDF. Include important text: paragraphs, lists, tips, facts, sidebars. Skip page numbers/footers. For images use [Image: <exact caption>]. Put in additional_sections as array of { title, content_md }. Do NOT extract or include any content for Exercise, Practice Questions, Revision Questions, or similar sections—omit them from additional_sections entirely.

Output JSON:
{
  "outline": ["<heading1>", "<heading2>", ...],
  "in_syllabus_only": ["<syllabus title with no match in PDF>"],
  "in_pdf_only": [
    { "title": "<section title from PDF>", "insert_after_index": 0, "micro_topics": ["<sub1>"] }
  ],
  "additional_sections": [
    { "title": "<same as in_pdf_only title>", "content_md": "<Markdown content>" }
  ]
}`;
}

function buildNodeNotesPrompt(pub, chapterTitle, nodeTitle, levelLabel) {
  return `You are extracting study notes from a textbook chapter PDF (ICSE grade ${pub.grade}, subject: ${pub.subject}).
Chapter: "${chapterTitle}".

Extract study notes for this ${levelLabel || 'section'}: "${nodeTitle}".

Scope (critical): Extract ONLY the content that appears under this heading and BEFORE the next same-level or higher-level heading. Do NOT include content that belongs to sub-headings—those are extracted separately. If the book has sub-sections under this heading, include only a short intro or overview for this heading; put detailed content under the sub-section nodes.

If this section is an Exercise, Practice Questions, Revision Questions, or any similar question/answer or practice section, do NOT extract content. Return only: { "content_blocks": [{ "content_md": "" }] }.

Style rules (critical):
- Use strictly textbook-style, third-person language. No conversational phrases (e.g. do NOT use "As you can see", "Let us look at", "We will now", "You should").
- Bold **key terms** and important concepts for revision.
- Preserve all exam-relevant detail: definitions, dates, names, cause-effect, and lists. Do not summarize away detail.
- Prefer short bullets or numbered lists where the PDF has lists; keep full sentences only where needed for clarity. Preserve all granular detail.
- Use verbatim or very close language from the PDF. Include every important element: paragraphs, lists, tips, facts, "Important", "Note", sidebars. Skip page numbers and footers.
- For images/diagrams use: [Image: <exact caption from PDF>].
- Output one or more content blocks (e.g. intro paragraph = block 1, main points = block 2). Use Markdown (headings, lists, **bold**).

Output a single JSON object only. No markdown fences, no explanation. Escape double quotes inside JSON strings (e.g. \\").
{
  "content_blocks": [
    { "content_md": "<Markdown for this block>" }
  ]
}
If the section has no content or is an exercise/practice section, return content_blocks: [{ "content_md": "" }].`;
}

async function runWithRetry(apiKey, pdfPath, prompt) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callGemini(apiKey, pdfPath, prompt);
    } catch (err) {
      if (attempt < MAX_RETRIES && is429(err)) {
        const waitMs = RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1);
        console.log(`  429 → retry ${attempt}/${MAX_RETRIES} in ${waitMs / 1000}s`);
        await delay(waitMs);
      } else {
        throw err;
      }
    }
  }
}

/** Recursively attach content_blocks to each node (mutates nodes). Only calls API for leaf nodes; parents get empty content_blocks. */
async function extractNotesForNodes(pub, pdfPath, chapterTitle, nodes, apiKey, needsReview, progress = null) {
  for (const node of nodes) {
    const isLeaf = !node.children || node.children.length === 0;
    if (isLeaf) {
      if (progress) {
        progress.current += 1;
        console.log(`    [ ${progress.current}/${progress.total} ] Extracting: ${node.title}`);
      }
      const prompt = buildNodeNotesPrompt(
        pub,
        chapterTitle,
        node.title,
        node.level_label
      );
      try {
        const result = await runWithRetry(apiKey, pdfPath, prompt);
        const blocks = result.content_blocks || [];
        node.content_blocks = blocks.map((b) => ({ content_md: b.content_md ?? '' }));
        if (blocks.every((b) => !(b.content_md || '').trim())) needsReview.push(node.title);
      } catch (err) {
        console.error(`  Notes FAIL for node "${node.title}":`, err.message);
        needsReview.push(node.title);
        node.content_blocks = [];
      }
      await delay(DELAY_MS);
    } else {
      node.content_blocks = [];
      await extractNotesForNodes(pub, pdfPath, chapterTitle, node.children, apiKey, needsReview, progress);
    }
  }
}

async function processChapter(pub, pdfPath, pdfEntry, syllabus, apiKey) {
  const found = findSyllabusChapter(syllabus, pdfEntry);
  if (!found) {
    console.warn(`  No syllabus chapter match for ${pdfEntry.name}; skip.`);
    return null;
  }
  const { chapter: syllabusChapter, index: chapterIndex } = found;
  const chapterTitle = syllabusChapter.title;
  const chapterDiscipline = syllabusChapter.discipline ?? null;
  let nodes = getChapterNodes(syllabusChapter);
  const flatList = flattenNodes(nodes);

  console.log(`  Processing: ${pdfEntry.name}`);
  console.log(`  Reconciling outline with syllabus...`);

  // 1) Reconciliation + additional_sections
  const reconPrompt = buildReconciliationPrompt(
    pub,
    chapterTitle,
    chapterDiscipline,
    flatList
  );
  let reconciliation = { outline: [], in_syllabus_only: [], in_pdf_only: [], additional_sections: [] };
  try {
    const reconResult = await runWithRetry(apiKey, pdfPath, reconPrompt);
    reconciliation = {
      outline: reconResult.outline || [],
      in_syllabus_only: reconResult.in_syllabus_only || [],
      in_pdf_only: reconResult.in_pdf_only || [],
      additional_sections: reconResult.additional_sections || [],
    };
  } catch (err) {
    console.error(`  Reconciliation FAIL: ${pdfEntry.name}`, err.message);
    return null;
  }
  await delay(DELAY_MS);

  const leafCount = countLeaves(nodes);
  console.log(`  Outline reconciled (${(reconciliation.outline || []).length} PDF sections). Extracting notes for ${leafCount} leaf nodes (${flatList.length} total nodes)...`);

  // 2) Per-leaf notes extraction (DFS); parents get empty content_blocks. Do NOT overwrite syllabus.
  const needsReview = [];
  await extractNotesForNodes(pub, pdfPath, chapterTitle, nodes, apiKey, needsReview, { current: 0, total: leafCount });

  // 3) Build reference manifest: syllabus leaves (with has_notes) and stray leaves
  const syllabus_leaves = collectSyllabusLeaves(nodes);
  const stray_leaves = buildStrayLeaves(reconciliation.in_pdf_only, reconciliation.additional_sections);

  return {
    board: syllabus.board,
    grade: syllabus.grade,
    subject: syllabus.subject,
    book_slug: syllabus.book_slug,
    book_meta: syllabus.book_meta,
    chapter_sequence_number: syllabusChapter.sequence_number,
    chapter_title: chapterTitle,
    discipline: chapterDiscipline,
    reconciliation,
    nodes,
    additional_sections: reconciliation.additional_sections || [],
    needs_review: needsReview,
    manifest: { syllabus_leaves, stray_leaves },
  };
}

function writeNotesJson(pub, pdfEntry, data) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const disc = pdfEntry.discipline ? `_${pdfEntry.discipline}` : '';
  const filename = `notes_ICSE_${pub.grade}_${pub.subject}_${pub.book_slug}_Ch${String(pdfEntry.sequenceNumber).padStart(2, '0')}${disc}.json`;
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`  Wrote ${outPath}`);
}

function writeManifestJson(pub, pdfEntry, manifest) {
  if (!manifest) return;
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const disc = pdfEntry.discipline ? `_${pdfEntry.discipline}` : '';
  const filename = `notes_manifest_ICSE_${pub.grade}_${pub.subject}_${pub.book_slug}_Ch${String(pdfEntry.sequenceNumber).padStart(2, '0')}${disc}.json`;
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`  Wrote ${outPath}`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const bookFilter = getBookFilter();
  const chapterFilter = getChapterFilter();
  const disciplineFilter = getDisciplineFilter();
  const model = getGeminiModel();
  if (dryRun) console.log('Dry run: no API calls.\n');
  if (bookFilter) console.log(`Book filter: ${bookFilter}\n`);
  if (chapterFilter != null) console.log(`Chapter filter: ${chapterFilter}\n`);
  if (disciplineFilter) console.log(`Discipline filter: ${disciplineFilter}\n`);
  if (!dryRun) console.log(`AI model: ${model}\n`);

  const folders = getBookFolders();
  if (folders.length === 0) {
    console.log('No book folder(s) found. Check --book= or Books/ICSE/{grade}/{subject}/{book_slug}/.');
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && !dryRun) {
    console.error('GEMINI_API_KEY not set. Set it in scripts/study-notes-extract/.env or env.');
    process.exit(1);
  }

  for (const { pub, dir } of folders) {
    console.log(`${pub.subject} grade ${pub.grade} / ${pub.book_slug}`);
    const syllabus = loadSyllabusForBook(pub);
    if (!syllabus) {
      console.log('  No syllabus JSON found. Run syllabus extraction first.');
      continue;
    }
    let pdfs = listChapterPdfs(dir);
    if (chapterFilter != null) pdfs = pdfs.filter((e) => e.sequenceNumber === chapterFilter);
    if (disciplineFilter) pdfs = pdfs.filter((e) => (e.discipline || '').toLowerCase() === disciplineFilter);
    if (pdfs.length === 0) {
      console.log('  No chapter PDFs (or none match --chapter/--discipline).');
      continue;
    }
    for (const pdfEntry of pdfs) {
      const pdfPath = path.join(dir, pdfEntry.name);
      if (dryRun) {
        console.log(`  [dry] Would process: ${pdfEntry.name}`);
        continue;
      }
      console.log(`\n--- Chapter ${pdfEntry.sequenceNumber}${pdfEntry.discipline ? ` (${pdfEntry.discipline})` : ''} ---`);
      const data = await processChapter(pub, pdfPath, pdfEntry, syllabus, apiKey);
      if (data) {
        writeNotesJson(pub, pdfEntry, data);
        if (data.manifest) writeManifestJson(pub, pdfEntry, data.manifest);
      }
      await delay(DELAY_MS);
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
