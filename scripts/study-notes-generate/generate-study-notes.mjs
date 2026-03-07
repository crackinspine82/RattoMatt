#!/usr/bin/env node
/**
 * Generate one concise study-note JSON file per chapter from PDF + syllabus.
 * Output is upsertable into the curation engine (see backend scripts curation-import).
 * Reuses book/PDF discovery and syllabus resolution from study-notes-extract.
 * See docs/STUDY_NOTE_GENERATION.md.
 *
 * Usage:
 *   File/PDF: node generate-study-notes.mjs [--book=slug] [--chapter=N] [--discipline=history|civics] [--concurrency=N] [--syllabus-dir=path]
 *   DB (published): node generate-study-notes.mjs --from-db (--chapter-id=uuid | --grade=N --book=slug --chapter=N [--discipline=history|civics]) [--concurrency=N]
 * Requires: GEMINI_API_KEY. For --from-db: DATABASE_URL. Optional: GEMINI_MODEL, SYLLABUS_DIR (or --syllabus-dir).
 * Output: out/study_notes_Ch{N}_{subject}_{book_slug}[_{discipline}].json
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

// Load backend .env for DATABASE_URL when using --from-db
try {
  const backendEnv = path.join(ROOT, 'backend', '.env');
  if (fs.existsSync(backendEnv)) {
    const lines = fs.readFileSync(backendEnv, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
} catch (_) {}

function getSyllabusDir() {
  const arg = process.argv.find((a) => a.startsWith('--syllabus-dir='));
  if (arg) return path.resolve(__dirname, arg.slice('--syllabus-dir='.length).trim());
  const env = process.env.SYLLABUS_DIR?.trim();
  if (env) return path.resolve(__dirname, env);
  return path.join(__dirname, '../syllabus-extract/out');
}

function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
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

function getConcurrency() {
  const arg = process.argv.find((a) => a.startsWith('--concurrency='));
  if (!arg) return 4;
  const n = parseInt(arg.slice('--concurrency='.length).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return 4;
  return Math.min(10, Math.max(1, n));
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hasFromDb() {
  return process.argv.includes('--from-db');
}

function getChapterIdArg() {
  const arg = process.argv.find((a) => a.startsWith('--chapter-id='));
  if (!arg) return null;
  return arg.slice('--chapter-id='.length).trim() || null;
}

function getGradeArg() {
  const arg = process.argv.find((a) => a.startsWith('--grade='));
  if (!arg) return null;
  const n = parseInt(arg.slice('--grade='.length).trim(), 10);
  return Number.isFinite(n) ? n : null;
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

function getSyllabusPath(pub, syllabusDir) {
  const filename = `syllabus_ICSE_${pub.grade}_${pub.subject}_${pub.book_slug}.json`;
  return path.join(syllabusDir, filename);
}

function loadSyllabusForBook(pub, syllabusDir) {
  const p = getSyllabusPath(pub, syllabusDir);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

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

// Study note rules from docs/content_model_icse_grade_9_history_civics.md Section 10
const HISTORY_RULES = `- Preserve **chronology** and **sequence** of events; dates and order matter.
- Preserve **cause–effect** and **consequences**; these are frequently asked ("State two causes of…", "State two consequences of…").
- Preserve **names** (movements, leaders, events, places) and **definitions** verbatim or with minimal paraphrase.
- Structure so that "State two…", "Name the…", "Explain the importance of…" style revision is easy (clear bullets or short paragraphs per point).
- For source- or image-based content, preserve context (e.g. "With reference to the picture…") and what led to / resulted from.`;

const CIVICS_RULES = `- Preserve **definitions** and **constitutional/institutional terminology** exactly (e.g. "Directive Principles", "Writ", "Federalism").
- Preserve **Article and Schedule references** (e.g. Article 36, Part IV) where the PDF mentions them.
- Preserve **procedures and processes** (e.g. steps in passing a bill, election process) in clear order; use numbered lists where appropriate.
- Preserve **institutional roles** and designations (e.g. President, Lok Sabha, Supreme Court) as in the textbook.
- Structure so that "Define…", "State two features of…", "Differentiate between…", "Explain with reference to Article…" style revision is easy.`;

const GENERAL_DISCIPLINE_RULES = `- Use **third-person**, textbook-style language. No conversational filler ("Let us see", "You should").
- **Bold** key terms and concepts. Keep all exam-relevant detail; do not summarize away content.
- When syllabus outline is provided below, **align headings** to it (Section → Topic → Subtopic) so the generated Markdown mirrors the syllabus structure.`;

// Generic rules from docs/STUDY_NOTE_GENERATION.md
const GENERIC_RULES = `1. **Do not miss any detail** – Include all exam-relevant content: definitions, dates, names, cause–effect, steps, lists, "Important" / "Note" boxes, and sidebars. Omit only page numbers, footers, and non-content clutter.
2. **Structured and concise** – Use clear hierarchy. Use bullets or numbered lists where the PDF has lists. Use **bold** for key terms. Prefer short paragraphs.
3. **Preserve language** – Keep the textbook's wording and terminology. Paraphrase only when necessary for clarity or concision.
4. **Exclusions** – Do NOT include: Exercise / practice questions / revision questions / "Try this" answer sections; pure decorative or repeated text.
5. **Images** – Where the PDF has figures, write: [Image: <exact caption from PDF>]. Do not invent captions.`;

const SKIP_EXERCISE = `**CRITICAL – Skip Exercise section:** Do NOT include any "Exercise", "Practice Questions", "Revision Questions", "Try This", or similar question/answer sections from the PDF. Omit them entirely. Do not create a section or any content for them. Stop extracting content at the start of such a section.`;

function buildPrompt(pub, chapterTitle, discipline, flatOutline) {
  const grade = pub.grade;
  const subject = pub.subject;
  const outlineBlock =
    flatOutline && flatOutline.length > 0
      ? flatOutline
          .map((item) => `  ${item.depth + 1}. ${'  '.repeat(item.depth)}${item.title} (${item.level_label})`)
          .join('\n')
      : '  (none – structure by PDF order)';

  let disciplineBlock = '';
  if (subject === 'HistoryCivics' && discipline) {
    if (discipline === 'history') {
      disciplineBlock = `\n**History discipline – apply these rules:**\n${HISTORY_RULES}\n\n**General:**\n${GENERAL_DISCIPLINE_RULES}`;
    } else {
      disciplineBlock = `\n**Civics discipline – apply these rules:**\n${CIVICS_RULES}\n\n**General:**\n${GENERAL_DISCIPLINE_RULES}`;
    }
  } else {
    disciplineBlock = `\n**General:**\n${GENERAL_DISCIPLINE_RULES}`;
  }

  return `You are generating **concise study notes** from a textbook chapter PDF for ICSE grade ${grade}, subject: ${subject}.
Chapter title: "${chapterTitle}".${discipline ? ` Discipline: ${discipline}.` : ''}

${SKIP_EXERCISE}

**Syllabus outline for this chapter (use this order and hierarchy for sections):**
${outlineBlock}

**Task:** Extract study notes for the full chapter in the same order as the outline above. Each section = one entry in the "sections" array. Do not include any Exercise / Practice / Revision question sections.
${disciplineBlock}

**Content rules (generic):**
${GENERIC_RULES}

**Output:** A single JSON object only, no markdown fence, no explanation. Format:
{
  "sections": [
    { "title": "<section title>", "level_label": "Section" | "Topic" | "Subtopic", "content_md": "<Markdown content for this section>" }
  ]
}
Use level_label "Section" for top-level, "Topic" for mid-level, "Subtopic" for sub-sections. Order must follow the syllabus outline. Do not add a section for the chapter title; start with the first content section.`;
}

/** Prompt to condense one node's full-extract content (HTML/text) into concise revision-note Markdown. */
function buildCondensePrompt(nodeTitle, levelLabel, contentHtml) {
  const text = (contentHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28000);
  return `You are condensing textbook content into concise revision notes (Markdown). Preserve key terms, definitions, dates, cause-effect, and lists. Use **bold** for key terms. Output only valid JSON: { "content_md": "<Markdown string>" }. No other text, no markdown fences.

Section (${levelLabel}): "${nodeTitle}"

Full content to condense:
${text || '(no content)'}

If the content above is missing or empty, output only {"content_md": ""}. Do not add explanatory or placeholder text.
Output JSON: { "content_md": "..." }`;
}

function stripJsonFence(text) {
  const trimmed = (text || '').trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : trimmed;
}

async function getPdfPageCount(pdfPath) {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const pdfBuffer = fs.readFileSync(pdfPath);
    const doc = await PDFDocument.load(pdfBuffer);
    return doc.getPageCount();
  } catch (err) {
    console.warn('  Could not get page count:', err?.message || err);
    return null;
  }
}

async function callGeminiForJson(apiKey, pdfPath, prompt) {
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
  const jsonStr = stripJsonFence(text);
  return JSON.parse(jsonStr);
}

/** Call Gemini with text only (no PDF). Returns parsed JSON. */
async function callGeminiForJsonTextOnly(apiKey, prompt) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const model = getGeminiModel();
  const response = await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ text: prompt }] }] });
  const text = response?.text ?? response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error('Empty response from Gemini');
  const jsonStr = stripJsonFence(text);
  return JSON.parse(jsonStr);
}

function chapterNumPad(n) {
  return n < 10 ? `0${n}` : String(n);
}

function outputFilename(pub, pdfEntry) {
  const ch = chapterNumPad(pdfEntry.sequenceNumber);
  const subject = (pub.subject || '').replace(/\s+/g, '');
  const slug = pub.book_slug || 'book';
  const disc = pdfEntry.discipline ? `_${pdfEntry.discipline}` : '';
  return `study_notes_Ch${ch}_${subject}_${slug}${disc}.json`;
}

/** Output filename for from-db (no pub/pdfEntry). */
function outputFilenameFromDb(grade, subjectName, sequenceNumber, discipline) {
  const ch = chapterNumPad(sequenceNumber);
  const subject = (subjectName || '').replace(/\s+/g, '');
  const slug = (loadPublications().find((p) => p.grade === grade && p.book_name === subjectName)?.book_slug || subject) || 'book';
  const disc = discipline ? `_${discipline}` : '';
  return `study_notes_Ch${ch}_${subject}_${slug}${disc}.json`;
}

function buildOutputPayload(pub, pdfEntry, sections, pageCount = null) {
  const payload = {
    board: 'ICSE',
    grade: pub.grade,
    subject: pub.subject,
    book_slug: pub.book_slug,
    book_meta: {
      book_name: pub.book_name || pub.book_slug,
      publication: pub.publication || null,
      author: pub.author || null,
    },
    chapter_sequence_number: pdfEntry.sequenceNumber,
    chapter_title: pdfEntry.title,
    discipline: pdfEntry.discipline || null,
    generated_at: new Date().toISOString(),
    sections: Array.isArray(sections) ? sections : [],
  };
  if (pageCount != null && Number.isFinite(pageCount)) payload.page_count = Math.max(1, Math.round(pageCount));
  return payload;
}

function buildOutputPayloadFromDb(resolved, sections, bookSlug, pageCount = null) {
  const subjectName = resolved.subjectName || '';
  const slug = bookSlug || (loadPublications().find((p) => p.grade === resolved.grade && p.book_name === subjectName)?.book_slug) || 'book';
  const payload = {
    board: 'ICSE',
    grade: resolved.grade,
    subject: subjectName,
    book_slug: slug,
    book_meta: { book_name: subjectName, publication: null, author: null },
    chapter_sequence_number: resolved.sequenceNumber,
    chapter_title: resolved.chapterTitle,
    discipline: resolved.discipline ?? null,
    generated_at: new Date().toISOString(),
    sections: Array.isArray(sections) ? sections : [],
  };
  if (pageCount != null && Number.isFinite(pageCount)) payload.page_count = Math.max(1, Math.round(pageCount));
  return payload;
}

async function processOneChapter(apiKey, pub, dir, pdfEntry, syllabus, disciplineFilter) {
  const pdfPath = path.join(dir, pdfEntry.name);
  const syllabusChapter = syllabus ? findSyllabusChapter(syllabus, pdfEntry) : null;
  const nodes = syllabusChapter ? getChapterNodes(syllabusChapter.chapter) : [];
  const flatOutline = flattenNodes(nodes);
  const prompt = buildPrompt(pub, pdfEntry.title, pdfEntry.discipline || disciplineFilter || null, flatOutline);
  const outName = outputFilename(pub, pdfEntry);
  const outPath = path.join(OUT_DIR, outName);

  try {
    const [pageCount, parsed] = await Promise.all([
      getPdfPageCount(pdfPath),
      callGeminiForJson(apiKey, pdfPath, prompt),
    ]);
    const sections = parsed?.sections ?? [];
    const payload = buildOutputPayload(pub, pdfEntry, sections, pageCount);
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`  OK: ${pdfEntry.name} -> ${outName} (${sections.length} sections${pageCount != null ? `, ${pageCount} pages` : ''})`);
    return { ok: true };
  } catch (err) {
    console.error(`  Error ${pdfEntry.name}: ${err.message}`);
    return { ok: false };
  }
}

async function fromDbFlow(apiKey) {
  const { getPool, resolveChapter, loadNodesWithNoteBlocks } = await import('../shared/db-published.mjs');
  const pool = getPool();
  const chapterIdArg = getChapterIdArg();
  const gradeArg = getGradeArg();
  const bookFilter = getBookFilter();
  const chapterFilter = getChapterFilter();
  const disciplineFilter = getDisciplineFilter();
  const concurrency = getConcurrency();

  let resolved;
  if (chapterIdArg) {
    resolved = await resolveChapter(pool, { chapterId: chapterIdArg });
    if (!resolved) {
      console.error('Chapter not found for --chapter-id=', chapterIdArg);
      process.exit(1);
    }
  } else {
    if (gradeArg == null || !bookFilter || chapterFilter == null) {
      console.error('--from-db requires either --chapter-id=uuid OR (--grade=N --book=slug --chapter=N [--discipline=history|civics]).');
      process.exit(1);
    }
    const pubs = loadPublications().filter((p) => p.grade === gradeArg && p.book_slug === bookFilter);
    if (pubs.length === 0) {
      console.error('No publication found for grade', gradeArg, 'book', bookFilter);
      process.exit(1);
    }
    resolved = await resolveChapter(pool, {
      board: 'ICSE',
      grade: gradeArg,
      subjectName: pubs[0].book_name,
      chapterNum: chapterFilter,
      discipline: disciplineFilter ?? null,
    });
    if (!resolved) {
      console.error('Chapter not found in DB for grade/book/chapter/discipline. Publish structure first.');
      process.exit(1);
    }
  }

  const nodes = await loadNodesWithNoteBlocks(pool, resolved.chapterId);
  if (nodes.length === 0) {
    console.error('No published syllabus nodes or note_blocks for this chapter. Publish structure and full extract first.');
    process.exit(1);
  }

  console.log(`From DB: ${resolved.chapterTitle} (${nodes.length} nodes). Concurrency: ${concurrency}\n`);

  const sections = [];
  for (let i = 0; i < nodes.length; i += concurrency) {
    const batch = nodes.slice(i, i + concurrency);
    const end = Math.min(i + concurrency, nodes.length);
    console.log(`  Condensing nodes ${i + 1}–${end} of ${nodes.length}…`);
    const results = await Promise.all(
      batch.map(async (node) => {
        const text = (node.content_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!text) {
          console.log(`  Skip (no content): "${node.title}"`);
          return { title: node.title, level_label: node.level_label, content_md: '', syllabus_node_id: node.id };
        }
        try {
          const prompt = buildCondensePrompt(node.title, node.level_label, node.content_html);
          const parsed = await callGeminiForJsonTextOnly(apiKey, prompt);
          return {
            title: node.title,
            level_label: node.level_label,
            content_md: (parsed?.content_md ?? '').trim(),
            syllabus_node_id: node.id,
          };
        } catch (err) {
          console.error(`  Condense FAIL for node "${node.title}":`, err.message);
          return { title: node.title, level_label: node.level_label, content_md: '', syllabus_node_id: node.id };
        }
      })
    );
    sections.push(...results);
    console.log(`  Done ${sections.length}/${nodes.length} nodes`);
    if (i + concurrency < nodes.length) await delay(1000);
  }

  let pageCountRow = null;
  try {
    pageCountRow = await pool.query(
      'SELECT page_count FROM chapters WHERE id = $1',
      [resolved.chapterId]
    ).then((r) => r.rows[0]?.page_count ?? null);
  } catch (err) {
    if (err?.code !== '42703') throw err;
    // column "page_count" does not exist — DB may not have migration; treat as null
  }
  const bookSlug = loadPublications().find((p) => p.grade === resolved.grade && p.book_name === resolved.subjectName)?.book_slug;
  const payload = buildOutputPayloadFromDb(resolved, sections, bookSlug, pageCountRow);
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const outName = outputFilenameFromDb(resolved.grade, resolved.subjectName, resolved.sequenceNumber, resolved.discipline);
  const outPath = path.join(OUT_DIR, outName);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log('Wrote', outPath, `(${sections.length} sections, syllabus_node_id set)`);
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error('Missing GEMINI_API_KEY. Set it in .env or the environment.');
    process.exit(1);
  }

  if (hasFromDb()) {
    await fromDbFlow(apiKey);
    return;
  }

  const syllabusDir = getSyllabusDir();
  const chapterFilter = getChapterFilter();
  const disciplineFilter = getDisciplineFilter();
  const concurrency = getConcurrency();

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const folders = getBookFolders();
  if (folders.length === 0) {
    console.error('No book folders found. Check BOOKS path and --book= filter.');
    process.exit(1);
  }

  console.log(`Concurrency: ${concurrency} chapter(s) at a time\n`);

  for (const { pub, dir } of folders) {
    const pdfs = listChapterPdfs(dir);
    const syllabus = loadSyllabusForBook(pub, syllabusDir);
    const toProcess = pdfs.filter((e) => {
      if (chapterFilter != null && e.sequenceNumber !== chapterFilter) return false;
      if (disciplineFilter != null && e.discipline !== disciplineFilter) return false;
      return true;
    });
    if (toProcess.length === 0) continue;

    for (let i = 0; i < toProcess.length; i += concurrency) {
      const batch = toProcess.slice(i, i + concurrency);
      console.log(`Generating ${batch.length} chapter(s) in parallel: ${batch.map((e) => e.name).join(', ')}`);
      await Promise.all(
        batch.map((pdfEntry) => processOneChapter(apiKey, pub, dir, pdfEntry, syllabus, disciplineFilter))
      );
      if (i + concurrency < toProcess.length) await delay(1000);
    }
  }
}

main();
