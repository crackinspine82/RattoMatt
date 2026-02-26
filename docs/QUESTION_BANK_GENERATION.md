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

**Long-format (node-aware) config** — when using `--from-db`, the block **long_format** applies to types like `structured_essay`:

- **depth_weights:** 20% depth 0, 30% depth 1, 50% depth 2. Allocation order: depth 2 → depth 1 → depth 0; shortfall at one depth carries forward to the next.
- **min_words:** 150 — a node is eligible for long-format if its **subtree** (node + all descendants) has at least this many words in published revision notes.
- **min_descendants:** 3 — or if the node has at least this many descendants. Eligible nodes are only at depth 0, 1, or 2.

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

**Run (file-based notes):**

```bash
cd scripts/question-bank-generate
npm install
# Set GEMINI_API_KEY in .env
node generate-question-bank.mjs --grade=9 --book=TotalHistoryCivics_MorningStar_DollyESequeira --chapter=1 --discipline=history [--notes-dir=path] [--pages=N] [--out-dir=out]
```

**Run (from DB — content-aware node assignment):**

```bash
# Requires DATABASE_URL (e.g. backend/.env). Uses published syllabus_nodes and revision_note_blocks.
node generate-question-bank.mjs --from-db (--chapter-id=uuid | --grade=N --book=slug --chapter=N --discipline=history) [--pages=N] [--out-dir=out]
```

**Options:**

| Option | Meaning |
|--------|--------|
| `--grade=N` | Grade (9 or 10). |
| `--book=slug` | Book slug (e.g. TotalHistoryCivics_MorningStar_DollyESequeira). |
| `--chapter=N` | Chapter number. |
| `--discipline=history\|civics` | Discipline for History & Civics. |
| `--from-db` | Use published syllabus and notes from DB (see **Content-aware node assignment** below). Requires `--chapter-id=uuid` or `--grade` + `--book` + `--chapter` + `--discipline`. |
| `--chapter-id=uuid` | Chapter UUID (use with `--from-db`). |
| `--notes-dir=path` | Directory containing notes JSON (default: ../study-notes-extract/out). |
| `--pages=N` | Override page count (optional; else stub or DB). |
| `--out-dir=path` | Output directory (default: out). |
| `--structure-images-dir=path` | Folder of chapter structure images (only when **not** using `--from-db`). Default: `Books/ICSE/{grade}/HistoryCivics/{book}/Ch{N}_{discipline}_images/`. With `--from-db`, 60% within-structure images come from the **curation API** instead (see below). |
| `--resume` | Load existing output file; generate only missing questions per (type, difficulty); merge and overwrite. |
| `--only-types=type1,type2` | Load existing output; remove items of these types; generate only those types; merge back. Example: `--only-types=picture_study_linked,mcq_visual_scenario` to regenerate only picture study and visual scenario questions. |

**Output:** `out/sample_questions_Ch{N}_{discipline}.json` — same structure as existing sample_questions files for `curation:import`. Questions may include `scenario_data` (e.g. `image_placeholder_caption` for picture study, `image_instruction` for visual scenario) and, when run with `--from-db`, **section_ref** or **section_refs** (path strings) for resolution to syllabus nodes (see below).

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

**Image source ratio (per type):** 60% of questions use images **within the structure** (output **scenario_data.structure_image_name**); 40% use **outside** (description for curator: **image_placeholder_caption** or **image_instruction**). Strategy: `structure_images.within_structure_pct` (default 60).

- **With `--from-db`:** The 60% within-structure list comes from the **curation API**: `GET /curation/items/:id/structure-images` (the script resolves the chapter’s questions item id and calls this endpoint). Set **CURATION_API_TOKEN** in env (e.g. in `backend/.env`) and optionally **CURATION_API_URL** (default `http://localhost:3000`). If the API call fails (network, 401, etc.), the run **aborts** with a clear error. The API returns image slug and published node ids; each (slug, node) becomes one question slot. In the curation app, slugs are set from the image **filename (no extension)** when uploading (multi-upload; duplicates skipped). No folder is used for 60% in this mode.
- **Without `--from-db`:** The 60% list comes from a **folder** of images (camelCase filenames). Default: `Books/ICSE/{grade}/HistoryCivics/{book_slug}/Ch{N}_{discipline}_images/`; override with `--structure-images-dir`. If the folder is missing or empty, all questions use the outside path.

- **picture_study_linked:** The generator finds all `[Image: <caption>]` placeholders in the chapter notes (extract or generate format). It generates **N** picture-study questions (N from strategy). Each question has three sub-parts (i) Identify, (ii) Explain, (iii) Significance, plus model answer and rubric. Images are reused round-robin if N exceeds the number of placeholders. Each question includes **scenario_data.image_placeholder_caption** (the `[Image: ...]` string) so the curation UI can show “Upload image for: &lt;caption&gt;” and the SME can upload the image later.
- **mcq_visual_scenario:** The generator produces full MCQ questions (stem + options + model answer + rubric) and an **image_instruction** describing what image to use (e.g. “A map of Harappan sites with Lothal and Mohenjo-daro marked”). Each question includes **scenario_data.image_instruction** so the SME can upload the right image in curation.

Within-structure questions are tailored to the named image; outside-structure questions include a description so the curator can generate or upload the image. Curation import persists **scenario_data** on `draft_questions`; the app uses **structure_image_name** to link to an existing chapter image or **image_instruction** / **image_placeholder_caption** for upload.

**Regenerating only these types:** Run with `--only-types=picture_study_linked,mcq_visual_scenario` (and the same `--grade`, `--book`, `--chapter`, `--discipline`, `--out-dir`). The script loads the existing output file, removes items of those types, generates only picture study and visual scenario questions, and merges them back into the file. Then re-run curation import (e.g. `--questions-only` with the questions dir) to update the DB.

---

## Content-aware node assignment (--from-db)

When the generator is run with **`--from-db`**, it uses the **published syllabus tree** and **revision_note_blocks** from the DB. In this mode:

1. **Syllabus tree with paths** — The prompt includes the full syllabus tree with **path-from-root** for each node (e.g. `"Causes of the First War > Political Causes > Disrespect Shown to Bahadur Shah"`). The model is asked to output, for **each question**, either **section_ref** (single path string) or **section_refs** (array of path strings when the question spans multiple topics). The generator does **not** assign node IDs; that is done in the **resolution** step.

2. **Node-aware long-format (e.g. structured_essay)** — For types like `structured_essay`, the plan is built per **eligible node** (depth 0/1/2 with subtree word count ≥ `min_words` or descendant count ≥ `min_descendants`). When total essay count ≥ number of eligible nodes, **every eligible node gets at least one**; the remainder is distributed by depth weights (50% → depth 2, 30% → depth 1, 20% → depth 0) in round-robin within each depth. Otherwise, counts are distributed by depth with carry-forward. Batches are scoped to each node’s subtree so questions are generated for that section; each question still has **section_ref** or **section_refs** in the output.

3. **Node-aware MCQs** — With `--from-db`, all MCQ (subtypes and difficulties) are allocated **evenly across all syllabus nodes**: nodes are ordered by **depth descending** (deepest first), then tree order; total MCQ count is distributed round-robin so each node gets the same target (totalMCQ/numNodes). Every node gets at least one MCQ when total MCQ count ≥ number of nodes. Each batch is node-scoped and outputs **section_ref** / **section_refs**.

4. **Node-aware short types** — With `--from-db`, **short_answer**, **short_source_interpretation**, and **deductive_application** use the same allocation as MCQs: even split across all nodes (depth-desc order), at least one per node when total for that type ≥ number of nodes. Each batch is node-scoped and outputs **section_ref** / **section_refs**.

5. **Picture study (structure images and nodes)** — Within the 60% within-structure share: when the number of within-structure questions ≥ number of structure images, **every structure image gets at least one** question; remainder is distributed evenly across images. With `--from-db`, the 60% within-structure questions are assigned to nodes in **round-robin** (so each has a node for **section_ref**). The 40% outside-structure questions are spread **only over nodes that received zero** from the 60%; if every node was used, the 40% is spread equally across all nodes. All picture-study questions output **section_ref** when node-scoped.

6. **Resolution (merge-questions-node-ids)** — After generation, run the merge script so that **section_ref** / **section_refs** are resolved to **syllabus_node_id**:
   - **Path match:** Exact or normalized path (trim, collapse spaces) to the tree.
   - **Title fallback:** If no path match, normalized title match; if multiple nodes match, first in tree order is used.
   - **Multiple refs:** Each ref is resolved to one node id; the question is assigned the **LCA** (lowest common ancestor) of those nodes.
   - **Unresolved:** If ref(s) cannot be resolved, **question.syllabus_node_id** is set to **null** and a warning is logged. There is no round-robin fallback for that question.
   - If the file has **no** section_ref/section_refs on any question, the script falls back to **item-level** round-robin (backward compatibility).

   Run: `npm run curation:merge-questions-node-ids -- <chapter_id> <path-to-sample_questions_*.json>` from `backend/`.

7. **Curation import** — When creating draft questions from the JSON, the importer uses **question.syllabus_node_id** when present; otherwise it uses **item.syllabus_node_id**. So per-question assignment from resolution is honoured.

**Workflow:** Generate with `--from-db` → output has **section_ref** / **section_refs** per question (no node IDs). Run merge script with chapter ID and output path → **question.syllabus_node_id** is filled (or null if unresolved). Run curation import → draft_questions get the correct syllabus_node_id per question.

---

## Links

- **Question types and rubrics:** `docs/question-types/icse-grade10-history-civics.md` (and Grade 9: `icse-grade9-history-civics.md`).
- **Curation import:** `docs/CURATION_SYSTEM.md`; from `backend/`: `npm run curation:import [syllabus-dir] [notes-dir] [questions-dir]` with questions-dir pointing at the generator `out/`.
- **Study notes and page_count:** `docs/STUDY_NOTE_GENERATION.md`; study-notes-generate can add `page_count` to output; curation-import writes it to `chapters.page_count`.
