# Curation System (Admin + SME)

This document captures the design for the ingestion (admin) and curation (SME) system. Curation allows educators to visually review and edit generated content before it is published to the app. v1 focuses on **syllabus structure** and **study notes**; questions and rubrics follow later with the same patterns.

## 1) What Gets Curated

| Content type   | v1      | Later   | Curation meaning                                      |
|---------------|--------|--------|--------------------------------------------------------|
| Syllabus structure | ✅ | ✅     | Edit level (Section/Topic/Subtopic/Point/Sub-point), reparent, add/remove nodes, edit titles |
| Study notes   | ✅     | ✅     | Link blocks to structure; create nodes for orphans; ensure no gaps |
| Questions & answers | —  | ✅     | Edit question text, model answers, link to nodes       |
| Rubrics       | —      | ✅     | Form-based edit (blocks, criteria, scores)             |

This list is extensible (e.g. images, passages).

**Note:** v1 here means the curation **UI** (structure + notes editors). Import of questions into `draft_questions` is already supported; full questions/rubrics editing in the curation app follows later.

## 2) Roles and Flows

### Admin (ingestion – v1 mostly offline)

- Logs into web console (future).
- Uploads PDFs (chapter- or subject-level) – future.
- Runs extraction scripts (syllabus, study notes, later Q&A/rubrics) **offline**.
- Runs **Import to Curation** script: reads JSON from script output path → fills **draft** tables and creates **curation items**.
- After SME curates: runs **Publish** (script or in-app): copies draft → published tables for items marked Ready to Publish.
- v1: No assignment UI; admin assigns work to SMEs outside the app (e.g. "you do Ch 3 Notes").

### SME (curation app – web, separate from parent app)

1. Logs in (admin-created accounts; separate curation app for v1).
2. Sees **full list** of curation items (all chapters × content types), sorted by subject/chapter. (Assignment filtering later.)
3. Selects an item (e.g. "Ch 3 – Structure", "Ch 3 – Notes").
4. **Curation:**
   - **Save** – work in progress (draft).
   - **Test** – preview (as student would see) + validation (subject rules); both before marking Ready to Publish.
   - **Ready to Publish** – marks that item ready; admin publishes later.
5. Admin runs Publish; content becomes visible in the app.

### Status (per curation item)

| Status           | Meaning |
|------------------|--------|
| Not started      | Draft tables empty or just created; no SME work yet. |
| In progress      | SME has opened and may have saved; not ready. |
| Ready to publish | SME marked done; awaiting admin Publish. |
| Published        | Draft copied to published; app reads this content. |

Status is **per assignment** (per chapter + content type), not per row.

## 3) Data Model

### Single content DB; draft vs published (Option A)

- **Published tables** (app reads only these): `subjects`, `chapters`, `syllabus_nodes`, `note_blocks`, and later `questions`, `rubrics`, etc. (existing schema).
- **Draft tables** (SME edits): mirror the content that is curated, scoped by chapter + content type:
  - `draft_syllabus_nodes` – same shape as `syllabus_nodes` but with `curation_item_id` (or chapter_id + "draft" scope); no FK to published.
  - `draft_note_blocks` – same shape as `note_blocks`, linked to `draft_syllabus_nodes` via `draft_syllabus_node_id` (or equivalent).
- **Curation items** (one per chapter × content type):
  - `curation_items` (id, subject_id, chapter_id, content_type enum: structure \| notes \| questions \| rubrics, status enum: not_started \| in_progress \| ready_to_publish \| published, assigned_to nullable, created_at, updated_at).
- **Publish:** For each item in `ready_to_publish`, copy draft rows for that (chapter, content_type) into published tables (replace existing published content for that chapter). Then set item status to `published`.

### Later corrections / additions

- **Add content later** (e.g. more MCQs): Create new rows in draft tables; run Publish → they are copied to published. No impact on existing flow.
- **Edit published content later:** Reopen that chapter/content type for curation (e.g. copy published → draft or load into draft), SME edits, marks Ready to Publish, admin runs Publish again. Draft overwrites published for that scope.

## 4) Structure Editor (SME)

- **Change level:** Dropdown or control to set `level_label` (Section \| Topic \| Subtopic \| Point \| Sub-point) and adjust `depth` if needed.
- **Reparent:** Drag a node to another parent (or "Move to" picker); update `parent_id` and `sequence_number` / depth.
- **Add / remove / edit:** Add child nodes, delete nodes, edit node title (text).
- Tree view of `draft_syllabus_nodes` for the chapter; operations write to draft only.

## 5) Study Notes Editor (SME)

- **Prerequisite:** Structure for that chapter must exist (draft or published); editor ensures each note block has a parent in the structure and vice versa.
- **Display:** Show structure tree; for each node, list linked note blocks. Highlight:
  - Nodes with no notes.
  - Note blocks with no node (orphans, e.g. from PDF-only / additional_sections).
- **Orphan handling (Option B):** SME can (1) **link** an orphan note to an **existing** structure node, or (2) **create a new** structure node and link the note to it.
- **Edit:** Edit note block content (e.g. rich text or Markdown); link/unlink from nodes. All edits in draft tables.

## 6) Import to Curation (script)

- **Input:** Path to script output (e.g. `scripts/syllabus-extract/out/`, `scripts/study-notes-extract/out/`).
- **Actions:**
  - Read syllabus JSON(s) → for each chapter, insert into `draft_syllabus_nodes` (and create subject/chapter if needed in published or a staging area as needed).
  - Read notes JSON(s) → insert into `draft_note_blocks`, linking to `draft_syllabus_nodes` by matching chapter + node title/path; orphan blocks get no node (or "unsorted" placeholder) for SME to link later. When importing **study_notes_*.json**, if the file contains **page_count**, the script updates **chapters.page_count** for that chapter (used by question-bank generation).
  - Read **sample_questions_*.json** (produced by the question-bank generator; see `docs/QUESTION_BANK_GENERATION.md`) → insert into `draft_questions` and `draft_rubrics`.
  - Create or update `curation_items` for each (chapter, content_type: structure \| notes \| questions) with status `not_started`.
- **When:** Admin runs after syllabus extract + study-notes extract (and optionally question-bank generate). No in-app upload in v1.

## 7) Publish (script or in-app)

- **Input:** Curation items with status `ready_to_publish` (or admin selects which to publish).
- **Actions:** For each such item (chapter, content_type):
  - **Structure:** Copy `draft_syllabus_nodes` for that chapter → `syllabus_nodes` (replace existing nodes for that chapter). Ensure `chapters` / `subjects` exist.
  - **Notes:** Copy `draft_note_blocks` for that chapter → `note_blocks`, mapping draft node IDs to published `syllabus_nodes` IDs.
  - Set curation item status to `published`.
- App already reads from `syllabus_nodes` and `note_blocks`; no app change required.
- **Questions/rubrics:** The flow to copy `draft_questions` (and `draft_rubrics`) → published tables will be added when the assessment engine uses published questions. Until then, test paper generation and validation use draft tables.

## 8) Test (preview + validation)

- **Preview:** Render structure and notes as the student would see (e.g. read-only view in curation app).
- **Validation:** Run subject-specific rules (e.g. required fields, level_labels allowed, note–node linkage). Show errors before SME can mark Ready to Publish (optional: block until valid or allow with warnings).
- No "generate sample paper" in v1.

## 9) Auth and Access (v1)

- **SME:** Admin-created accounts (e.g. email + password or magic link); stored in backend used by curation app.
- **Curation app:** Separate from parent app; its own login and routes. Role-based "SME" only for v1; admin assignment UI later.
- **List:** Full list of curation items (all chapters × content types); no "assigned to me" filter in v1. Assignment table/config can be added later so SMEs see only assigned items.

## 10) Subject Config (board + grade + subject)

- Each board+grade+subject has its own content model (e.g. question types, discipline, rubric shape). Stored in docs today (e.g. `content_model_icse_grade_9_history_civics.md`); later in DB or JSON config.
- v1 (structure + notes): Structure editor is generic (level_labels, tree). Study notes editor is generic (blocks, link to nodes). Subject-specific validation can use config when we add it.
- Later (questions, rubrics): Form UI and validation driven by subject config (e.g. question_types, rubric schema per type).

## 11) Build Order (v1)

1. **Schema:** Add draft tables (`draft_syllabus_nodes`, `draft_note_blocks`) and `curation_items` to the content DB (or backend that owns content). Ensure `chapters`/`subjects` exist for scope.
2. **Import script:** Backend/CLI script that reads syllabus + notes JSON from path, upserts into draft tables, creates/updates `curation_items`. Run after existing extract scripts.
3. **Curation API:** Auth (admin-created SME accounts), endpoints: list curation items, get draft structure/notes for an item, save draft structure/notes, set status (in_progress, ready_to_publish). Optional: preview and validation endpoints.
4. **Curation app (web):** Login, list (full list of items by chapter/content type), structure editor (tree, level, reparent, add/remove/edit), study notes editor (blocks, link to nodes, create node for orphan, highlight gaps). Save, Test (preview + validation), Ready to Publish.
5. **Publish script:** Script (or in-app action) that, for items in `ready_to_publish`, copies draft → published and sets status to `published`.

Later: assignment table + UI (admin assigns items to SMEs), questions + rubrics content types, in-app JSON upload for import.

## 12) References

- **Implementation spec:** `docs/CURATION_SPEC.md` (per-question ready, incremental publish, three-column structure+notes, single extraction script).
- Content model: `docs/content_model_icse_grade_9_history_civics.md`
- DB schema: `docs/DB_SCHEMA.md`, `backend/scripts/schema-mvp1.sql`
- Study notes flow: `docs/STUDY_NOTES_FLOW.md`
- Project context: `CURSOR_PROJECT_CONTEXT.md`
