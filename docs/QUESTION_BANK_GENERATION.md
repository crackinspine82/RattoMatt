# Question bank generation

This document describes how **question banks** are generated per chapter from study notes, using a configurable strategy (questions per page, type mix, difficulty). Output is importable into the curation engine as draft questions.

---

## Purpose

- Generate a **full set of questions** per chapter: total = **page count × questions_per_page** (e.g. 25 per page).
- Distribute questions by **type** (MCQ, short answer, essay, picture study, etc.), **MCQ sub-type**, and **difficulty** (L1–L4) according to a single **strategy config**.
- Use **study notes** (one JSON per chapter) as context; support both **extract** and **generate** note formats.
- Output **sample_questions_*.json** for `curation:import` (same shape as existing question import).

---

## Strategy (single source of truth)

Strategy is defined in **`scripts/question-bank-generate/strategy-icse-history-civics.yaml`**.

- **questions_per_page:** 25 (total questions = pages × 25).
- **types:** Percent of total — MCQ 50%, short_answer 20%, structured_essay 20%, short_source_interpretation 5%, picture_study_linked 4%, deductive_application 1%.
- **mcq_subtypes:** Percent of MCQ count — mcq_standard 40%, mcq_visual_scenario 20%, mcq_logic_table 10%, mcq_assertion_reason 10%, mcq_odd_one_out 6%, mcq_chronology_sequence 6%, mcq_source_connection 4%, mcq_relationship_analogy 4%.
- **difficulty_by_type:** Per-type difficulty split (e.g. MCQs: L1 25%, L2 50%, L3 20%, L4 5%; short_answer: L1 40%, L2 50%, L3 10%; etc.).

The generator **reads this file** and computes counts for each (question_type, difficulty_level). No hardcoded numbers in the script.

---

## Page count

Total questions = **page_count × questions_per_page**. Page count is resolved in order:

1. **CLI** — `--pages=N` (overrides all).
2. **Stub config** — `scripts/question-bank-generate/stub_page_counts.yaml`: list of `chapter` + `discipline` → `page_count`. Use when the chapter PDF page count is not yet in the DB.
3. **DB** — `chapters.page_count` (optional; when study-notes-generate output includes `page_count` and curation-import has run).

If none of these provide a value, the generator **exits with an error** and asks you to set `--pages=N`, add a stub, or run notes import so the chapter has `page_count`.

**Stub config** format:

```yaml
stub_page_counts:
  - chapter: 1
    discipline: history
    page_count: 25
  - chapter: 1
    discipline: civics
    page_count: 6
```

Remove or update stub entries once re-extraction has run and `chapters.page_count` is populated.

---

## Notes input (extract vs generate)

The generator accepts **either** notes format:

- **Extract:** `notes_ICSE_{grade}_HistoryCivics_{book_slug}_Ch{N}_{discipline}.json` — has `nodes` (tree) and `reconciliation.additional_sections`. Context = flattened nodes + additional sections.
- **Generate:** `study_notes_Ch{N}_HistoryCivics_{book_slug}_{discipline}.json` — has `sections` (flat array of `{ title, level_label, content_md }`). Context = concatenated sections.

Point **`--notes-dir`** at the directory that contains the notes (e.g. `../study-notes-extract/out` or `../study-notes-generate/out`). The script detects format and builds chapter context accordingly.

---

## Coverage

Questions should be **spread evenly** across the chapter (sections, topics, subtopics, content blocks). The generator prompt instructs the model to distribute questions across all sections and not cluster on one part. Optionally the prompt includes a list of section/topic titles from the notes.

---

## Script usage

**Location:** `scripts/question-bank-generate/`

**Run:**

```bash
cd scripts/question-bank-generate
npm install
# Set GEMINI_API_KEY in .env
node generate-question-bank.mjs --grade=9 --book=TotalHistoryCivics_MorningStar_DollyESequeira --chapter=1 --discipline=history [--notes-dir=path] [--pages=N] [--out-dir=out]
```

**Options:**

| Option | Meaning |
|--------|--------|
| `--grade=N` | Grade (9 or 10). |
| `--book=slug` | Book slug (e.g. TotalHistoryCivics_MorningStar_DollyESequeira). |
| `--chapter=N` | Chapter number. |
| `--discipline=history\|civics` | Discipline for History & Civics. |
| `--notes-dir=path` | Directory containing notes JSON (default: ../study-notes-extract/out). |
| `--pages=N` | Override page count (optional; else stub or DB). |
| `--out-dir=path` | Output directory (default: out). |
| `--resume` | Load existing output file; generate only missing questions per (type, difficulty); merge and overwrite. |
| `--only-types=type1,type2` | Load existing output; remove items of these types; generate only those types; merge back. Example: `--only-types=picture_study_linked,mcq_visual_scenario` to regenerate only picture study and visual scenario questions. |

**Output:** `out/sample_questions_Ch{N}_{discipline}.json` — same structure as existing sample_questions files for `curation:import`. Questions may include `scenario_data` (e.g. `image_placeholder_caption` for picture study, `image_instruction` for visual scenario) for curation UI and SME upload.

**Test run (Ch1 History + Ch1 Civics):** Use stub page counts (25 for History Ch1, 6 for Civics Ch1). Run once with `--chapter=1 --discipline=history` and once with `--chapter=1 --discipline=civics`.

---

## Page-count helper

A small helper script **`scripts/count-pdf-pages/count-pages.mjs`** (or equivalent) takes a PDF path and prints the number of pages. Use it to get `N` for `--pages=N` or to fill the stub config. Run from repo root or script dir:

```bash
node scripts/count-pdf-pages/count-pages.mjs --pdf=path/to/chapter.pdf
```

---

## Books folder and PDF naming

- **Path:** `Books/ICSE/{grade}/{subject}/{book_slug}/`
- **Chapter PDFs:** Naming as in study-notes-generate (e.g. `1 - Title.pdf`, `History_1 - Title.pdf` for History & Civics). See `scripts/study-notes-generate/README.md`.

---

## Picture study and visual MCQs

- **picture_study_linked:** The generator finds all `[Image: <caption>]` placeholders in the chapter notes (extract or generate format). It generates **N** picture-study questions (N from strategy). Each question has three sub-parts (i) Identify, (ii) Explain, (iii) Significance, plus model answer and rubric. Images are reused round-robin if N exceeds the number of placeholders. Each question includes **scenario_data.image_placeholder_caption** (the `[Image: ...]` string) so the curation UI can show “Upload image for: &lt;caption&gt;” and the SME can upload the image later.
- **mcq_visual_scenario:** The generator produces full MCQ questions (stem + options + model answer + rubric) and an **image_instruction** describing what image to use (e.g. “A map of Harappan sites with Lothal and Mohenjo-daro marked”). Each question includes **scenario_data.image_instruction** so the SME can upload the right image in curation.

Curation import persists **scenario_data** on `draft_questions`; the curation app can later surface caption/instruction and allow uploading the image (e.g. into `source_material_url` or stimulus).

**Regenerating only these types:** Run with `--only-types=picture_study_linked,mcq_visual_scenario` (and the same `--grade`, `--book`, `--chapter`, `--discipline`, `--out-dir`). The script loads the existing output file, removes items of those types, generates only picture study and visual scenario questions, and merges them back into the file. Then re-run curation import (e.g. `--questions-only` with the questions dir) to update the DB.

---

## Links

- **Question types and rubrics:** `docs/question-types/icse-grade10-history-civics.md` (and Grade 9: `icse-grade9-history-civics.md`).
- **Curation import:** `docs/CURATION_SYSTEM.md`; from `backend/`: `npm run curation:import [syllabus-dir] [notes-dir] [questions-dir]` with questions-dir pointing at the generator `out/`.
- **Study notes and page_count:** `docs/STUDY_NOTE_GENERATION.md`; study-notes-generate can add `page_count` to output; curation-import writes it to `chapters.page_count`.
