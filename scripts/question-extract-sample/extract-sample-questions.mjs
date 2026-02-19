#!/usr/bin/env node
/**
 * Sample question extraction: for 2 History + 2 Civics chapters, generate
 * 2 questions per (question_type, difficulty_level) with model answer and rubric.
 * Uses notes JSON from study-notes-extract as context. Requires GEMINI_API_KEY.
 *
 * Run: node extract-sample-questions.mjs [--chapter=1|2] [--types=mcq_standard,short_answer] [--difficulties=1,2] [--dry-run]
 * Output: out/sample_questions_Ch{N}_{discipline}.json
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DOCS = path.join(ROOT, 'docs');
const NOTES_OUT = path.join(__dirname, '../study-notes-extract/out');
const OUT_DIR = path.join(__dirname, 'out');

const QUESTION_TYPES = [
  'mcq_standard',
  'mcq_logic_table',
  'mcq_visual_scenario',
  'mcq_assertion_reason',
  'mcq_source_connection',
  'mcq_odd_one_out',
  'mcq_chronology_sequence',
  'mcq_relationship_analogy',
  'match_columns',
  'short_answer',
  'structured_essay',
  'picture_study_linked',
  'source_passage_analysis',
  'deductive_application',
];
const DIFFICULTY_LEVELS = [1, 2, 3, 4];
const DIFFICULTY_TAGS = { 1: 'easy', 2: 'medium', 3: 'difficult', 4: 'complex' };
const QUESTIONS_PER_CELL = 2;
const DELAY_MS = 3000;
const MAX_RETRIES = 3;

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

function listNotesFiles() {
  const files = fs.readdirSync(NOTES_OUT);
  const out = [];
  for (const f of files) {
    if (!f.startsWith('notes_ICSE_') || !f.endsWith('.json') || f.includes('manifest')) continue;
    const m = f.match(/notes_ICSE_9_HistoryCivics_(.+)_Ch(\d+)_(history|civics)\.json/);
    if (m) out.push({ file: f, book_slug: m[1], chapterNum: parseInt(m[2], 10), discipline: m[3] });
  }
  out.sort((a, b) => a.chapterNum - b.chapterNum || a.discipline.localeCompare(b.discipline));
  const history = out.filter((x) => x.discipline === 'history').slice(0, 2);
  const civics = out.filter((x) => x.discipline === 'civics').slice(0, 2);
  return [...history, ...civics];
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
  let text = flattenNodesToText(notes.nodes || []);
  for (const s of notes.reconciliation?.additional_sections || []) {
    text += (s.title || '') + '\n' + (s.content_md || '') + '\n';
  }
  return text;
}

function getChapterFilter() {
  const arg = process.argv.find((a) => a.startsWith('--chapter='));
  if (!arg) return null;
  const n = parseInt(arg.slice('--chapter='.length).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function getTypesFilter() {
  const arg = process.argv.find((a) => a.startsWith('--types='));
  if (!arg) return [];
  return arg
    .slice('--types='.length)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function getDifficultiesFilter() {
  const arg = process.argv.find((a) => a.startsWith('--difficulties='));
  if (!arg) return [];
  return arg
    .slice('--difficulties='.length)
    .split(',')
    .map((d) => parseInt(d.trim(), 10))
    .filter(Number.isFinite);
}

function stripCodeFence(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : trimmed;
}

async function callGemini(apiKey, prompt) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const model = getGeminiModel();
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const text = response?.text ?? response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error('Empty response from Gemini');
  const jsonStr = stripCodeFence(text);
  return JSON.parse(jsonStr);
}

async function runWithRetry(apiKey, prompt) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callGemini(apiKey, prompt);
    } catch (err) {
      if (attempt < MAX_RETRIES && is429(err)) {
        await delay(8000 * Math.pow(2, attempt - 1));
      } else {
        throw err;
      }
    }
  }
}

function buildPrompt(notes, questionType, difficultyLevel) {
  const difficultyTag = DIFFICULTY_TAGS[difficultyLevel];
  const chapterTitle = notes.chapter_title || '';
  const discipline = notes.discipline || 'history';
  const context = buildChapterContext(notes);

  const civicsGuidance =
    discipline === 'civics'
      ? ' For Civics: use precise constitutional/institutional terminology; include Article/Schedule references where relevant; definitions must have Article ref; differentiate_concepts and procedure_process styles are appropriate.'
      : ' For History: use cause-effect, chronology, significance; "State two causes/consequences", "Name the movement/event/leader", "Explain the importance of".';

  return `You are generating ICSE Grade 9 History & Civics exam-style questions. Board style: ${discipline === 'civics' ? 'Civics' : 'History'}.
Chapter: "${chapterTitle}". Discipline: ${discipline}.${civicsGuidance}

Question type: ${questionType}. Difficulty: ${difficultyTag} (level ${difficultyLevel}).

Chapter content (use only this for factual accuracy):
---
${context.slice(0, 28000)}
---

Generate exactly ${QUESTIONS_PER_CELL} distinct questions of this type and difficulty, each with a model answer and a rubric.

Rules:
- Rubric must be valid JSON: rubric_version (2), total_marks, question_type ("${questionType}"), difficulty_level (${difficultyLevel}), difficulty_tag ("${difficultyTag}"), answer_input_type ("typed" or "choice"), blocks array with id, label, selection (min/max), match_mode, criteria (id, keywords, score). For MCQ use answer_input_type "choice" and optionally answer_key (correct_option, logic_explanation for assertion-reason). For typed answers include penalties and scoring_rules (allow_partial, partial_increment, max_score_cap) where appropriate.
- For picture_study_linked or source_passage_analysis describe the question and expected answer; rubric can reference "identification", "explanation" blocks; you may omit actual image/passage.
- Output only a single JSON object, no markdown fences. Escape double quotes in strings.

Output format:
{
  "questions": [
    {
      "question_text": "<full question stem>",
      "model_answer_text": "<model answer or key>",
      "rubric": { ... full rubric object ... }
    }
  ]
}`;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error('Set GEMINI_API_KEY in .env');
    process.exit(1);
  }
  if (!fs.existsSync(NOTES_OUT)) {
    console.error('Notes dir not found:', NOTES_OUT);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const chapterFilter = getChapterFilter();
  const typesFilter = getTypesFilter();
  const difficultiesFilter = getDifficultiesFilter();
  const dryRun = process.argv.includes('--dry-run');

  const list = listNotesFiles();
  const types = typesFilter.length ? typesFilter : QUESTION_TYPES;
  const difficulties = difficultiesFilter.length ? difficultiesFilter : DIFFICULTY_LEVELS;

  for (const { file, book_slug, chapterNum, discipline } of list) {
    if (chapterFilter != null && chapterNum !== chapterFilter) continue;
    const notesPath = path.join(NOTES_OUT, file);
    const notes = JSON.parse(fs.readFileSync(notesPath, 'utf8'));
    const items = [];
    let cellIndex = 0;
    const totalCells = types.length * difficulties.length;
    for (const questionType of types) {
      for (const difficultyLevel of difficulties) {
        cellIndex++;
        if (dryRun) {
          console.log(`[dry-run] ${file} ${questionType} difficulty=${difficultyLevel}`);
          items.push({
            question_type: questionType,
            difficulty_level: difficultyLevel,
            difficulty_tag: DIFFICULTY_TAGS[difficultyLevel],
            questions: [],
          });
          continue;
        }
        const prompt = buildPrompt(notes, questionType, difficultyLevel);
        try {
          const result = await runWithRetry(apiKey, prompt);
          const questions = Array.isArray(result?.questions) ? result.questions.slice(0, QUESTIONS_PER_CELL) : [];
          items.push({
            question_type: questionType,
            difficulty_level: difficultyLevel,
            difficulty_tag: DIFFICULTY_TAGS[difficultyLevel],
            questions: questions.map((q) => ({
              question_text: q.question_text ?? '',
              model_answer_text: q.model_answer_text ?? '',
              rubric: q.rubric ?? {},
            })),
          });
          console.log(`  ${file} ${questionType} d=${difficultyLevel} (${cellIndex}/${totalCells}) ok`);
        } catch (err) {
          console.error(`  ${file} ${questionType} d=${difficultyLevel} failed:`, err.message);
          items.push({
            question_type: questionType,
            difficulty_level: difficultyLevel,
            difficulty_tag: DIFFICULTY_TAGS[difficultyLevel],
            questions: [],
            error: err.message,
          });
        }
        await delay(DELAY_MS);
      }
    }
    const out = {
      board: notes.board,
      grade: notes.grade,
      subject: notes.subject,
      book_slug: notes.book_slug || book_slug,
      book_meta: notes.book_meta || { book_name: notes.chapter_title || '' },
      chapter_sequence_number: notes.chapter_sequence_number ?? chapterNum,
      chapter_title: notes.chapter_title,
      discipline,
      generated_at: new Date().toISOString(),
      items,
    };
    const outFile = path.join(OUT_DIR, `sample_questions_Ch${String(chapterNum).padStart(2, '0')}_${discipline}.json`);
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote', outFile);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
