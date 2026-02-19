#!/usr/bin/env node
/**
 * Question bank generator: total = page_count × questions_per_page, distributed by strategy.
 * Reads strategy-icse-history-civics.yaml and stub_page_counts.yaml.
 * Output: sample_questions_Ch{N}_{discipline}.json for curation:import.
 *
 * Usage: node generate-question-bank.mjs --grade=9 --book=... --chapter=1 --discipline=history [--notes-dir=path] [--pages=N] [--out-dir=out]
 * Options:
 *   --resume — load existing output, generate only missing questions per (type, difficulty), merge and overwrite.
 *   --only-types=picture_study_linked,mcq_visual_scenario — load existing output, remove those types, generate only those types, merge back. Use to regenerate picture study and visual scenario questions only.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Load .env from script dir, then repo root, then sibling script folders that may have GEMINI_API_KEY
dotenv.config({ path: path.join(__dirname, '.env') });
if (!process.env.GEMINI_API_KEY?.trim()) dotenv.config({ path: path.join(ROOT, '.env') });
if (!process.env.GEMINI_API_KEY?.trim()) dotenv.config({ path: path.join(ROOT, 'scripts', 'study-notes-generate', '.env') });
if (!process.env.GEMINI_API_KEY?.trim()) dotenv.config({ path: path.join(ROOT, 'scripts', 'question-extract-sample', '.env') });
const STRATEGY_PATH = path.join(__dirname, 'strategy-icse-history-civics.yaml');
const STUB_PAGES_PATH = path.join(__dirname, 'stub_page_counts.yaml');

const DIFFICULTY_TAGS = { 1: 'easy', 2: 'medium', 3: 'difficult', 4: 'complex' };
const BATCH_SIZE = 10;
const DELAY_MS = 3000;
const MAX_RETRIES = 3;

function getArg(name, def = null) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return def;
  return arg.slice(`--${name}=`.length).trim();
}

function hasFlag(name) {
  return process.argv.some((a) => a === `--${name}`);
}

/** Parse --only-types=picture_study_linked,mcq_visual_scenario into a Set of type names, or null if not set. */
function getOnlyTypesFlag() {
  const arg = process.argv.find((a) => a.startsWith('--only-types='));
  if (!arg) return null;
  const list = arg.slice('--only-types='.length).split(',').map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? new Set(list) : null;
}

function loadStrategy() {
  const raw = fs.readFileSync(STRATEGY_PATH, 'utf8');
  return yaml.load(raw);
}

function loadStubPageCounts() {
  if (!fs.existsSync(STUB_PAGES_PATH)) return [];
  const raw = fs.readFileSync(STUB_PAGES_PATH, 'utf8');
  const doc = yaml.load(raw);
  return doc?.stub_page_counts ?? [];
}

function getPageCount(cliPages, chapterNum, discipline, stubConfig) {
  if (cliPages != null && Number.isFinite(Number(cliPages))) return Math.max(1, Math.round(Number(cliPages)));
  const stub = stubConfig.find((s) => s.chapter === chapterNum && (s.discipline || '') === (discipline || ''));
  if (stub?.page_count != null) return Math.max(1, Math.round(stub.page_count));
  return null;
}

/** Key for (type, difficulty) in existing map. */
function planKey(question_type, difficulty_level) {
  return `${question_type}|${difficulty_level}`;
}

/** Regex to find [Image: <caption>] placeholders in notes content. */
const IMAGE_PLACEHOLDER_REGEX = /\[Image:\s*[^\]]*\]/g;

/** Collect all [Image: ...] placeholders from notes (nodes, additional_sections, sections). Order preserved; duplicates possible. */
function collectImagePlaceholders(notes) {
  const out = [];

  function scanText(text) {
    if (!text || typeof text !== 'string') return;
    const matches = text.match(IMAGE_PLACEHOLDER_REGEX);
    if (matches) for (const m of matches) out.push(m);
  }

  if (notes.nodes && Array.isArray(notes.nodes)) {
    function walk(nodes) {
      for (const n of nodes) {
        for (const b of n.content_blocks || []) if (b?.content_md) scanText(b.content_md);
        if (n.children?.length) walk(n.children);
      }
    }
    walk(notes.nodes);
  }
  for (const s of notes.reconciliation?.additional_sections || []) scanText(s.content_md);
  if (notes.sections && Array.isArray(notes.sections)) {
    for (const sec of notes.sections) scanText(sec.content_md);
  }
  return out;
}

/** Load existing output file and return map of (type,diff) -> questions[], and file meta. Preserves scenario_data per question. */
function loadExistingOutput(outFile) {
  if (!fs.existsSync(outFile)) return null;
  const data = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  const map = new Map();
  for (const item of data.items || []) {
    const key = planKey(item.question_type, item.difficulty_level);
    const list = map.get(key) || [];
    for (const q of item.questions || []) {
      list.push({
        question_text: q.question_text ?? '',
        model_answer_text: q.model_answer_text ?? '',
        rubric: q.rubric ?? {},
        scenario_data: q.scenario_data ?? null,
      });
    }
    map.set(key, list);
  }
  return { existingByKey: map, meta: data };
}

/** Build list of { question_type, difficulty_level, count } from strategy and total. */
function computePlan(strategy, totalQuestions) {
  const plan = [];
  const qPerPage = strategy.questions_per_page ?? 25;
  const types = strategy.types || {};
  const mcqSub = strategy.mcq_subtypes || {};
  const diffByType = strategy.difficulty_by_type || {};

  for (const [typeKey, pct] of Object.entries(types)) {
    if (pct <= 0) continue;
    let typeCount = Math.round((totalQuestions * pct) / 100);
    if (typeCount <= 0) continue;

    if (typeKey === 'mcq') {
      for (const [subType, subPct] of Object.entries(mcqSub)) {
        const subCount = Math.round((typeCount * subPct) / 100);
        if (subCount <= 0) continue;
        const diff = diffByType.mcq || { L1: 25, L2: 50, L3: 20, L4: 5 };
        for (let L = 1; L <= 4; L++) {
          const lpct = diff[`L${L}`] ?? 0;
          const dCount = Math.round((subCount * lpct) / 100);
          if (dCount > 0) plan.push({ question_type: subType, difficulty_level: L, count: dCount });
        }
      }
    } else {
      const diff = diffByType[typeKey] || { L2: 100 };
      for (let L = 1; L <= 4; L++) {
        const lpct = diff[`L${L}`] ?? 0;
        const dCount = Math.round((typeCount * lpct) / 100);
        if (dCount > 0) plan.push({ question_type: typeKey, difficulty_level: L, count: dCount });
      }
    }
  }
  return plan;
}

function findNotesFile(notesDir, grade, bookSlug, chapterNum, discipline) {
  const ch = String(chapterNum).padStart(2, '0');
  const names = fs.readdirSync(notesDir);
  const extractPattern = new RegExp(`^notes_ICSE_${grade}_HistoryCivics_${bookSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_Ch${ch}_${discipline}\\.json$`);
  const generatePattern = new RegExp(`^study_notes_Ch${ch}_HistoryCivics_${bookSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_${discipline}\\.json$`);
  for (const n of names) {
    if (extractPattern.test(n) || generatePattern.test(n)) return path.join(notesDir, n);
  }
  return null;
}

function flattenNodesToText(nodes, prefix = '') {
  let s = '';
  if (!Array.isArray(nodes)) return s;
  for (const n of nodes) {
    s += prefix + (n.title || '') + '\n';
    for (const b of n.content_blocks || []) {
      if (b?.content_md) s += b.content_md + '\n';
    }
    s += flattenNodesToText(n.children || [], prefix + '  ');
  }
  return s;
}

function buildChapterContext(notes) {
  if (notes.nodes) {
    let text = flattenNodesToText(notes.nodes || []);
    for (const s of notes.reconciliation?.additional_sections || []) {
      text += (s.title || '') + '\n' + (s.content_md || '') + '\n';
    }
    return text;
  }
  if (notes.sections && Array.isArray(notes.sections)) {
    return notes.sections.map((sec) => (sec.title || '') + '\n' + (sec.content_md || '')).join('\n\n');
  }
  return '';
}

function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetriableApiError(err) {
  const msg = String(err?.message ?? err ?? '');
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('500') ||
    msg.includes('502')
  );
}

function stripCodeFence(text) {
  const trimmed = (text || '').trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : trimmed;
}

/** Try to fix common JSON issues from model output (trailing commas, etc.). */
function sanitizeJsonString(s) {
  let t = (s || '').trim();
  t = stripCodeFence(t);
  // Remove trailing commas before ] or }
  t = t.replace(/,(\s*[}\]])/g, '$1');
  return t;
}

function parseResponse(text) {
  if (!text) throw new Error('Empty response from Gemini');
  let raw = stripCodeFence(text);
  try {
    return JSON.parse(raw);
  } catch (e) {
    raw = sanitizeJsonString(text);
    try {
      return JSON.parse(raw);
    } catch (e2) {
      throw e;
    }
  }
}

async function callGemini(apiKey, prompt) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: getGeminiModel(),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const text = response?.text ?? response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseResponse(text);
}

async function runWithRetry(apiKey, prompt) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callGemini(apiKey, prompt);
    } catch (err) {
      const isRetryable =
        attempt < MAX_RETRIES &&
        (isRetriableApiError(err) || err instanceof SyntaxError);
      if (isRetryable) {
        await delay(8000 * Math.pow(2, attempt - 1));
      } else {
        throw err;
      }
    }
  }
}

function buildPrompt(notes, questionType, difficultyLevel, count, isPlaceholder) {
  const difficultyTag = DIFFICULTY_TAGS[difficultyLevel];
  const chapterTitle = notes.chapter_title || '';
  const discipline = notes.discipline || 'history';
  const context = buildChapterContext(notes);

  const civicsGuidance =
    discipline === 'civics'
      ? ' For Civics: use precise constitutional/institutional terminology; include Article/Schedule references where relevant.'
      : ' For History: use cause-effect, chronology, significance; "State two causes/consequences", "Name the movement/event/leader", "Explain the importance of".';

  const spreadInstruction =
    'Distribute the requested questions evenly across all sections, topics, subtopics and content blocks in the chapter. Do not cluster all questions on one section or topic.';

  if (isPlaceholder) {
    return `You are generating ICSE History & Civics exam-style questions. Chapter: "${chapterTitle}". Discipline: ${discipline}.${civicsGuidance}

Question type: ${questionType} (image-based). Difficulty: ${difficultyTag}.

Generate exactly 1 placeholder question: the question text should describe the image theme and sub-questions (e.g. "Image: [Describe the historical event/figure shown]. (i) Identify... (ii) Explain... (iii) Significance..."). Provide a brief model_answer_text and a minimal rubric (rubric_version 2, total_marks, answer_input_type "typed", blocks for each sub-part). Output only a JSON object: { "questions": [ { "question_text": "...", "model_answer_text": "...", "rubric": { ... } } ] }. No markdown fences.`;
  }

  return `You are generating ICSE History & Civics exam-style questions. Board style: ${discipline === 'civics' ? 'Civics' : 'History'}.
Chapter: "${chapterTitle}". Discipline: ${discipline}.${civicsGuidance}

Question type: ${questionType}. Difficulty: ${difficultyTag} (level ${difficultyLevel}).

${spreadInstruction}

Chapter content (use only this for factual accuracy):
---
${context.slice(0, 28000)}
---

Generate exactly ${count} distinct questions of this type and difficulty, each with a model answer and a rubric. Do not duplicate or repeat the same question (including rephrased versions); each question must be unique in content and meaning.

Rules:
- Rubric must be valid JSON: rubric_version (2), total_marks, question_type ("${questionType}"), difficulty_level (${difficultyLevel}), difficulty_tag ("${difficultyTag}"), answer_input_type ("typed" or "choice"), blocks array with id, label, selection (min/max), match_mode, criteria (id, keywords, score). For MCQ use answer_input_type "choice" and optionally answer_key (correct_option, logic_explanation for assertion-reason). For typed answers include scoring_rules where appropriate.
${questionType.startsWith('mcq_') ? `- For MCQs, question_text must include the full question stem followed by all four options on separate lines: (a) ..., (b) ..., (c) ..., (d) .... Do not omit the options. model_answer_text should be the correct option letter and optionally the answer text, e.g. (b) 1921.` : ''}
${questionType === 'structured_essay' ? `- For structured_essay only: Each question must have exactly three sub-parts labeled (i), (ii), (iii) — do not use (a)(b)(c). Total 10 marks. Use only one of these splits: 3+3+4 (preferred) or 2+4+4 (fallback). No sub-part may be 5 marks; each sub-part must be 2, 3, or 4 marks. In question_text, end each sub-part with the mark in brackets, e.g. (i) ... [3], (ii) ... [3], (iii) ... [4] or (i) ... [2], (ii) ... [4], (iii) ... [4]. Mark allocation rule: a 2-mark sub-part must expect 2–3 key points; a 3-mark sub-part must expect 3–4 key points; a 4-mark sub-part must expect 4 or more key points. Rubric must have exactly three blocks, each with sub_part_key "i", "ii", or "iii" (matching the sub-parts) and a "marks" (or "max_marks") field set to that part's marks (2, 3, or 4).` : ''}
- Output only a single JSON object, no markdown fences. Escape double quotes inside strings with backslash (\\"). Do not use unescaped newlines inside JSON string values.

Output format:
{
  "questions": [
    { "question_text": "<full question stem>", "model_answer_text": "<model answer or key>", "rubric": { ... } }
  ]
}`;
}

/** Prompt for one picture_study_linked question: image caption from extract; generate (i)(ii)(iii) sub-questions + model answer + rubric. */
function buildPictureStudyPrompt(notes, imagePlaceholderCaption, difficultyLevel) {
  const difficultyTag = DIFFICULTY_TAGS[difficultyLevel];
  const chapterTitle = notes.chapter_title || '';
  const discipline = notes.discipline || 'history';
  const context = buildChapterContext(notes);

  const civicsGuidance =
    discipline === 'civics'
      ? ' For Civics: use precise constitutional/institutional terminology; include Article/Schedule references where relevant.'
      : ' For History: use cause-effect, chronology, significance.';

  return `You are generating one ICSE History & Civics picture study question. Chapter: "${chapterTitle}". Discipline: ${discipline}.${civicsGuidance}

The textbook extract references this image placeholder: ${imagePlaceholderCaption}

Using the chapter content below, generate exactly one picture study question that will be shown alongside this image (the SME will upload the image later). The question must have exactly three sub-parts labeled (i), (ii), (iii): (i) Identify / describe what is shown, (ii) Explain significance or context, (iii) Significance/consequence or connection to the chapter.

Marks and format (strict):
- Total 10 marks. Use only one of these splits: 3+3+4 (preferred) or 2+4+4 (fallback). No sub-part may be 5 marks; each sub-part must be 2, 3, or 4 marks.
- In question_text, end each sub-part with the mark in brackets, e.g. (i) ... [3], (ii) ... [3], (iii) ... [4].
- Mark allocation rule: a 2-mark sub-part must expect 2–3 key points; a 3-mark sub-part must expect 3–4 key points; a 4-mark sub-part must expect 4 or more key points.
- Rubric must have exactly three blocks, each with sub_part_key "i", "ii", or "iii" and a "marks" (or "max_marks") field set to that part's marks (2, 3, or 4).

Difficulty: ${difficultyTag} (level ${difficultyLevel}).

Chapter content (use only this for factual accuracy):
---
${context.slice(0, 20000)}
---

Generate one JSON object with a single question: question_text must include the full stem and the three sub-questions (i), (ii), (iii) each ending with [n] as above. Provide model_answer_text and a rubric (rubric_version 2, total_marks 10, question_type "picture_study_linked", difficulty_level ${difficultyLevel}, answer_input_type "typed", blocks with sub_part_key and marks per sub-part). Do not include scenario_data or image fields in the output.

Output format (no markdown fences, escape double quotes in strings with \\"):
{
  "questions": [
    { "question_text": "<Study the image. (i) ... (ii) ... (iii) ...>", "model_answer_text": "<model answer>", "rubric": { ... } }
  ]
}`;
}

/** Prompt for mcq_visual_scenario: generate questions + image_instruction per question (SME will upload image later). */
function buildVisualScenarioPrompt(notes, difficultyLevel, count) {
  const difficultyTag = DIFFICULTY_TAGS[difficultyLevel];
  const chapterTitle = notes.chapter_title || '';
  const discipline = notes.discipline || 'history';
  const context = buildChapterContext(notes);

  const civicsGuidance =
    discipline === 'civics'
      ? ' For Civics: use precise constitutional/institutional terminology.'
      : ' For History: use cause-effect, chronology, maps, sources.';

  return `You are generating ICSE History & Civics MCQ visual scenario questions. Chapter: "${chapterTitle}". Discipline: ${discipline}.${civicsGuidance}

Question type: mcq_visual_scenario. Each question is an MCQ that refers to an image (e.g. map, diagram, photograph). The image will be uploaded later by an editor. You must provide for each question:
1. question_text: the question stem and four options (a)–(d), referring to "the image" or "the diagram" etc.
2. model_answer_text: the correct option and brief explanation.
3. rubric: rubric_version 2, total_marks, question_type "mcq_visual_scenario", difficulty_level ${difficultyLevel}, answer_input_type "choice", blocks/answer_key as needed.
4. image_instruction: a short instruction for the editor describing exactly what image to use (e.g. "A map of India showing Harappan sites with Lothal and Mohenjo-daro marked" or "Photograph of the Great Bath at Mohenjo-daro"). Be specific so the right image can be chosen.

Difficulty: ${difficultyTag}. Generate exactly ${count} distinct questions. Do not duplicate; each question and image_instruction must be unique.

Chapter content:
---
${context.slice(0, 22000)}
---

Output only a single JSON object (no markdown fences, escape double quotes with \\"):
{
  "questions": [
    { "question_text": "...", "model_answer_text": "...", "rubric": { ... }, "image_instruction": "..." }
  ]
}`;
}

async function main() {
  const grade = getArg('grade');
  const book = getArg('book');
  const chapterNum = parseInt(getArg('chapter'), 10);
  const discipline = getArg('discipline');
  const notesDir = getArg('notes-dir', path.join(__dirname, '../study-notes-extract/out'));
  const cliPages = getArg('pages');
  const outDir = getArg('out-dir', path.join(__dirname, 'out'));

  if (!grade || !book || !Number.isFinite(chapterNum) || !discipline) {
    console.error('Usage: node generate-question-bank.mjs --grade=9 --book=... --chapter=1 --discipline=history [--notes-dir=path] [--pages=N] [--out-dir=out] [--resume] [--only-types=type1,type2]');
    process.exit(1);
  }

  const strategy = loadStrategy();
  const stubConfig = loadStubPageCounts();
  const pageCount = getPageCount(cliPages, chapterNum, discipline, stubConfig);
  if (pageCount == null) {
    console.error('Page count required. Set --pages=N, add an entry in stub_page_counts.yaml, or run study-notes-generate + curation import so chapters.page_count is set.');
    process.exit(1);
  }

  const qPerPage = strategy.questions_per_page ?? 25;
  const totalQuestions = pageCount * qPerPage;
  console.log(`Chapter ${chapterNum} ${discipline}: ${pageCount} pages × ${qPerPage} = ${totalQuestions} questions`);

  const notesPath = findNotesFile(notesDir, grade, book, chapterNum, discipline);
  if (!notesPath || !fs.existsSync(notesPath)) {
    console.error('Notes file not found in', notesDir, 'for grade', grade, 'book', book, 'chapter', chapterNum, discipline);
    process.exit(1);
  }
  const notes = JSON.parse(fs.readFileSync(notesPath, 'utf8'));

  const plan = computePlan(strategy, totalQuestions);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error('Set GEMINI_API_KEY in .env (script dir, repo root, or scripts/study-notes-generate/.env)');
    process.exit(1);
  }

  const ch = String(chapterNum).padStart(2, '0');
  const outFile = path.join(outDir, `sample_questions_Ch${ch}_${discipline}.json`);
  const resume = hasFlag('resume');
  const onlyTypes = getOnlyTypesFlag();

  let existingByKey = new Map();
  let existingMeta = null;
  if (resume || onlyTypes) {
    const loaded = loadExistingOutput(outFile);
    if (onlyTypes && !loaded) {
      console.error('--only-types requires an existing output file:', outFile);
      process.exit(1);
    }
    if (loaded) {
      existingByKey = loaded.existingByKey;
      existingMeta = loaded.meta;
      if (resume) {
        const totalExisting = [...existingByKey.values()].reduce((s, arr) => s + arr.length, 0);
        console.log('Resume: loaded', outFile, '(', totalExisting, 'existing questions). Filling shortfalls.');
      }
      if (onlyTypes) {
        console.log('Only-types:', [...onlyTypes].join(', '), '— replacing those items and merging into', outFile);
      }
    } else if (resume) {
      console.error('--resume requires an existing output file:', outFile);
      process.exit(1);
    }
  }

  const imagePlaceholders = collectImagePlaceholders(notes);
  if (imagePlaceholders.length > 0) {
    console.log('Image placeholders in chapter:', imagePlaceholders.length);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const items = [];
  let done = 0;
  const totalBatches = plan.reduce((acc, p) => {
    if (onlyTypes && !onlyTypes.has(p.question_type)) return acc;
    const existing = (existingByKey.get(planKey(p.question_type, p.difficulty_level)) || []).length;
    const need = Math.max(0, p.count - existing);
    if (p.question_type === 'picture_study_linked') return acc + need;
    if (p.question_type === 'mcq_visual_scenario') return acc + (need > 0 ? Math.ceil(need / BATCH_SIZE) : 0);
    return acc + (need > 0 ? Math.ceil(need / BATCH_SIZE) : 0);
  }, 0);
  let batchIndex = 0;

  for (const { question_type, difficulty_level, count } of plan) {
    if (onlyTypes && !onlyTypes.has(question_type)) continue;

    const key = planKey(question_type, difficulty_level);
    const existingList =
      onlyTypes && onlyTypes.has(question_type) ? [] : (existingByKey.get(key) || []).slice(0, count);
    const need = count - existingList.length;

    if (question_type === 'picture_study_linked' && count > 0) {
      const questionsForItem = existingList.map((q) => ({
        question_text: q.question_text,
        model_answer_text: q.model_answer_text,
        rubric: q.rubric,
        scenario_data: q.scenario_data ?? null,
      }));
      const captions = imagePlaceholders.length > 0 ? imagePlaceholders : ['[Image: Refer to chapter illustration]'];
      for (let k = 0; k < need; k++) {
        const imageCaption = captions[(existingList.length + k) % captions.length];
        batchIndex++;
        try {
          const prompt = buildPictureStudyPrompt(notes, imageCaption, difficulty_level);
          const result = await runWithRetry(apiKey, prompt);
          const one = Array.isArray(result?.questions) ? result.questions[0] : null;
          if (one) {
            questionsForItem.push({
              question_text: one.question_text ?? '',
              model_answer_text: one.model_answer_text ?? '',
              rubric: one.rubric ?? {},
              scenario_data: { image_placeholder_caption: imageCaption },
            });
            done++;
            console.log(`  [${batchIndex}/${totalBatches}] picture_study_linked L${difficulty_level}: +1 (${done} total)`);
          }
        } catch (err) {
          console.error(`  [${batchIndex}/${totalBatches}] picture_study_linked L${difficulty_level} failed:`, err.message);
        }
        await delay(DELAY_MS);
      }
      if (questionsForItem.length > 0) {
        items.push({
          question_type: 'picture_study_linked',
          difficulty_level,
          difficulty_tag: DIFFICULTY_TAGS[difficulty_level],
          questions: questionsForItem.slice(0, count),
        });
      }
      continue;
    }

    if (question_type === 'mcq_visual_scenario' && count > 0) {
      const questionsForItem = existingList.map((q) => ({
        question_text: q.question_text,
        model_answer_text: q.model_answer_text,
        rubric: q.rubric,
        scenario_data: q.scenario_data ?? null,
      }));
      let remaining = need;
      while (remaining > 0) {
        const batchCount = Math.min(BATCH_SIZE, remaining);
        batchIndex++;
        try {
          const prompt = buildVisualScenarioPrompt(notes, difficulty_level, batchCount);
          const result = await runWithRetry(apiKey, prompt);
          const batch = Array.isArray(result?.questions) ? result.questions.slice(0, batchCount) : [];
          for (const q of batch) {
            questionsForItem.push({
              question_text: q.question_text ?? '',
              model_answer_text: q.model_answer_text ?? '',
              rubric: q.rubric ?? {},
              scenario_data: q.image_instruction != null ? { image_instruction: String(q.image_instruction) } : null,
            });
          }
          done += batch.length;
          remaining -= batch.length;
          console.log(`  [${batchIndex}/${totalBatches}] mcq_visual_scenario L${difficulty_level}: +${batch.length} (${done} total)`);
        } catch (err) {
          console.error(`  [${batchIndex}/${totalBatches}] mcq_visual_scenario L${difficulty_level} failed:`, err.message);
          remaining -= batchCount;
        }
        await delay(DELAY_MS);
      }
      if (questionsForItem.length > 0) {
        items.push({
          question_type: 'mcq_visual_scenario',
          difficulty_level,
          difficulty_tag: DIFFICULTY_TAGS[difficulty_level],
          questions: questionsForItem.slice(0, count),
        });
      }
      continue;
    }

    const questionsForItem = existingList.map((q) => ({
      question_text: q.question_text,
      model_answer_text: q.model_answer_text,
      rubric: q.rubric,
      scenario_data: q.scenario_data ?? null,
    }));
    let remaining = need;
    while (remaining > 0) {
      const batchCount = Math.min(BATCH_SIZE, remaining);
      batchIndex++;
      try {
        const prompt = buildPrompt(notes, question_type, difficulty_level, batchCount, false);
        const result = await runWithRetry(apiKey, prompt);
        const batch = Array.isArray(result?.questions) ? result.questions.slice(0, batchCount) : [];
        for (const q of batch) {
          questionsForItem.push({
            question_text: q.question_text ?? '',
            model_answer_text: q.model_answer_text ?? '',
            rubric: q.rubric ?? {},
            scenario_data: null,
          });
        }
        done += batch.length;
        remaining -= batch.length;
        console.log(`  [${batchIndex}/${totalBatches}] ${question_type} L${difficulty_level}: +${batch.length} (${done} total)`);
      } catch (err) {
        console.error(`  [${batchIndex}/${totalBatches}] ${question_type} L${difficulty_level} failed:`, err.message);
        remaining -= batchCount;
      }
      await delay(DELAY_MS);
    }
    if (questionsForItem.length > 0) {
      items.push({
        question_type,
        difficulty_level,
        difficulty_tag: DIFFICULTY_TAGS[difficulty_level],
        questions: questionsForItem.slice(0, count),
      });
    }
  }

  let outItems = items;
  if (onlyTypes && existingMeta?.items?.length) {
    const otherItems = existingMeta.items.filter((i) => !onlyTypes.has(i.question_type || ''));
    outItems = [...otherItems, ...items];
  }

  const out = {
    board: notes.board || 'ICSE',
    grade: Number(grade) || 9,
    subject: notes.subject || 'HistoryCivics',
    book_slug: notes.book_slug || book,
    book_meta: notes.book_meta || { book_name: notes.chapter_title || '' },
    chapter_sequence_number: chapterNum,
    chapter_title: notes.chapter_title,
    discipline,
    generated_at: new Date().toISOString(),
    items: outItems,
  };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8');
  console.log('Wrote', outFile, `(${outItems.length} items, ${outItems.reduce((s, i) => s + i.questions.length, 0)} questions)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
