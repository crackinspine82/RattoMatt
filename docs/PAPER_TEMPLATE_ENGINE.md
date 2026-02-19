# Paper Template Engine

This document describes how paper templates work, how they are loaded, and how they relate to question-type definitions. **Template configs themselves** live in separate files per board, grade, and subject (see [Template files](#template-files)).

---

## Template files

- **Location:** `docs/paper-templates/`
- **Naming:** `{board}-grade{grade}-{subject}.yaml` (e.g. `icse-grade10-history-civics.yaml`, `icse-grade9-history-civics.yaml`).
- **One file per (board, grade, subject):** Each file defines sections, marks, type mix, discipline split, and selection rules for that combination.
- **RapidFire:** A single master config `docs/paper-templates/rapidfire.yaml` defines MCQ-only RapidFire behaviour (duration, question count, types). The app uses this together with (board, grade, subject) for pool and context.

---

## Loading flow (board + grade + subject)

When generating a **paper** for a given board, grade, and subject:

1. **Resolve template:** Load the paper template from `docs/paper-templates/{board}-grade{grade}-{subject}.yaml` (e.g. for ICSE Grade 10 History & Civics → `icse-grade10-history-civics.yaml`).
2. **Resolve question-type definitions:** Load the question-type format definitions from `docs/question-types/{board}-grade{grade}-{subject}.md` (e.g. `icse-grade10-history-civics.md`). This doc is used for **question and answer (and rubric) generation**—prompts and validation rules for generating questions. The question-type doc may include a **Difficulty distribution** subsection that generators should follow (aligned with template `difficulty_targets` where present).
3. **Use template for:** Section layout, total marks, marks per section, question type mix per section, discipline split, best-of-N rules, substitution rules, and output schema.
4. **Use question-type doc for:** What each question type must/must not look like, rubric structure, and **validation of generated questions and rubrics** (see [Validation](#validation)).

The **same (board, grade, subject)** keys both assets; the generator must use the matching pair (template YAML + question-type MD) for a given paper.

---

## Template ID (unique key in app and DB)

- **`template_id`** (e.g. `icse_hc_g10_2h_80m`) is the **unique key** stored in the database and used in APIs.
- **Do not** use only (board, grade, subject) as the unique key: multiple templates could theoretically exist for the same triple (e.g. different durations). The canonical identifier for a committed paper, re-render, or config snapshot is **`template_id`**.
- Each template YAML must define `template_metadata.template_id`. Paper records store `template_id` and a **config_snapshot** of the template used at generation time.

---

## Versioning and config snapshot

- Each template YAML includes **`version`** and **`effective_from`** (under `template_metadata`).
- When a paper is committed (e.g. after "Take Test"), the app stores:
  - **`template_id`**
  - **`config_snapshot`** — the exact template settings used (sections, type mix, marks, etc.) as JSON or equivalent.
- This allows **re-rendering** the same paper later (e.g. student review) and ensures we know which template version was used for each paper.

---

## Validation (two separate layers)

Validation is split into two concerns:

1. **Question and answer generation (with rubrics)**  
   Rules are defined in the **question-type docs** (`docs/question-types/{board}-grade{grade}-{subject}.md`): e.g. no sub-question > 4 marks, MCQs have exactly 4 options, rubric must include `logic_explanation` for `mcq_assertion_reason`, picture_study allowed splits, etc. The question generator and rubric pipeline enforce these.

2. **Paper generation**  
   Rules apply when **building a paper** from the template and selected questions: e.g. total marks sum to template total, section question counts match template, discipline split respected, no duplicate question_ids. These rules are described in this engine doc and/or in the template YAML (e.g. a `validation` section). Pre-generation and post-generation checks (e.g. "Part I Q1: 16 questions", "marks sum to 80") are part of paper generation, not of question/rubric generation.

---

## Template core (what each template defines)

Each template YAML must define:

- **template_metadata:** template_id, board, grade, subject, duration_minutes, total_marks, version, effective_from.
- **paper_header:** Title, instructions, display strings (marks, time).
- **sections:** Part I / Part II (Section A, Section B), with subsection_id, marks_allocated, question_distribution (type_mix, discipline_ratio, marks_per_question), best_of_n where applicable.
- **selection_rules:** Repeat avoidance, discipline filtering, mastery weighting, difficulty targets, substitution rules, randomization.
- **output_schema:** Question paper PDF format, answer key format, paper_record schema (section_instances, question_instances, config_snapshot).
- **validation:** Pre-generation and post-generation checks for that template (optional but recommended).

---

## Section definition

Per section:

- Section name, display order, required/optional.
- Marks allocated to the section.
- Allowed question types and counts (type_mix).
- Best-of-N rules if applicable (e.g. attempt 2 of 3, score best 2).
- Discipline split (e.g. Section A = Civics only, Section B = History only).

---

## Best-of-N rules

If a section has choice (e.g. "Attempt any two from Section A"):

- Define `required_attempts` and `max_attempts_allowed`.
- When the student attempts more than required, drop the lowest-scoring attempts within that section.
- Scoring is applied after submission; the backend computes best-of-N from the attempted answers.

---

## Question selection rules

- Type distribution and difficulty mix per section (from template type_mix).
- Substitution rules when a question type is unavailable (from template).
- Repeat avoidance (e.g. 60-day lookback for committed tests and RapidFire); use cache or DB.
- Mastery-weighted selection when mastery data exists; otherwise random with repeat-avoidance.
- Discipline filtering: strict per section (e.g. Part I 50:50, Section A 100% Civics, Section B 100% History).

---

## Output artifacts

- **Question paper PDF** (preview with watermark, final without).
- **Answer key PDF** (rubrics, correct options, marking scheme).
- **Paper record (DB):** paper_id, template_id, config_snapshot, section_instances, question_instances, generation_timestamp. Stored on "Take Test" (commit).

---

## Typography and PDF

- Use **Tinos Regular/Bold** for questions, options, and marks. Embed fonts in PDF output.

---

## RapidFire

- **Config:** Single master file `docs/paper-templates/rapidfire.yaml` (duration, question count, MCQ-only types, repeat avoidance, discipline split).
- **Flow:** For "RapidFire for ICSE Grade 10 History & Civics", the app uses (board, grade, subject) to scope the question pool; RapidFire behaviour (10 questions, 15 min, MCQ-only, etc.) comes from the RapidFire master config.
- RapidFire is choice-based (MCQ) only, for quick use on the app (e.g. phone).

---

## Randomization

Papers are randomized on each generation; the same template config should not produce identical papers by default.

---

## Repeat avoidance (committed tests and RapidFire)

- Exclude questions the student answered correctly in the last 60 days (configurable).
- Apply to committed tests and to RapidFire.
- If the candidate pool is exhausted, allow repeats (fallback).
- Use a recent-questions cache (e.g. Redis) for performance where applicable.

---

## Test paper generation (temporary)

A **temporary test script** generates a board-style question paper PDF and answer key PDF from **draft_questions** in the curation DB (Ch1 History + Ch1 Civics only), to validate the pipeline before the full assessment engine is built.

- **Run from backend:** `npm run paper:test` or `npm run paper:test -- --out-dir=./out`
- **Requires:** Subject "Total History & Civics" (ICSE Grade 9), Ch1 History and Ch1 Civics chapters, and draft questions imported via `curation:import` (e.g. from question-bank-generate output).
- **Output:** `out/test_paper_<timestamp>.pdf` (question paper) and `out/test_paper_answer_key_<timestamp>.pdf` (answer key). Each run uses a new random selection; run 4–5 times to verify randomization.
- **Template:** `docs/paper-templates/icse-grade9-history-civics.yaml` (Part I 30 marks, Section A 20, Section B 30).
- **Image placeholders:** For picture_study_linked and mcq_visual_scenario without an image, the paper shows "Image to be inserted – &lt;instruction/caption&gt;".
- **Future:** Real paper generation will use **published** questions from the assessment DB after curation is complete.
