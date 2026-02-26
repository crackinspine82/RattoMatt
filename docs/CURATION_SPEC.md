# Curation System – Implementation Spec

This spec defines the **implementation details** for the curation system so SMEs can curate content in parallel to the app build. It extends the design in `docs/CURATION_SYSTEM.md` with concrete data model, API, UI, and script behaviour.

**Audience:** Developers implementing curation features; SMEs and admins following the workflow.

---

## 1. Overview

### 1.1 Goals

- **SME flow:** Login → List of chapters/items → Open item (Structure, Notes, Revision Notes, or Questions) → Edit → Save → Mark ready to publish. Admin runs publish script when ready.
- **Questions:** Per-question “Ready to publish” with two buckets (In Progress / Ready to Publish) for a better workspace; publish script publishes only questions marked ready (incremental).
- **Structure + Notes:** Single extraction script (structure + notes from PDF in one run); Structure/Notes editor with three columns (structure | nodes/blocks | HTML preview).
- **Curation live early** so SMEs can start curating and give feedback on the curation system.

### 1.2 Out of Scope (for this spec)

- Assignment (admin assigns chapters to SMEs): single shared list for now.
- In-app Publish button: admin runs script.
- Multiple SME accounts: one shared account for now.

---

## 2. Data Model Changes

### 2.1 Per-question “Ready to publish”

- **Table:** `draft_questions`
- **New column:** `ready_to_publish BOOLEAN NOT NULL DEFAULT FALSE`
- **Semantics:**
  - `FALSE` = question is in the “In Progress” bucket; not published.
  - `TRUE` = question is in the “Ready to Publish” bucket; included when admin runs publish for that chapter’s questions.
- **Migration:** Add column if not present; existing rows default to `FALSE`.

### 2.2 Curation items (unchanged)

- One `curation_item` per (chapter_id, content_type). For questions, the item still represents “Questions for this chapter”; status on the item is independent of per-question flags.
- Item status: `not_started` | `in_progress` | `ready_to_publish` | `published`. For questions, the item may be marked `ready_to_publish` when the SME is done with the batch (optional); the **publish script** uses per-question `ready_to_publish` to decide which draft questions to copy to published.

---

## 3. API Changes

### 3.1 Questions: per-question ready flag

- **GET** `/curation/items/:itemId/questions`  
  - Response must include a `ready_to_publish` (or equivalent) flag per question so the UI can render In Progress vs Ready to Publish buckets.
- **PUT** `/curation/items/:itemId/questions`  
  - Request body may include `ready_to_publish` per question (when saving the list).
- **PATCH** (new, recommended) `/curation/items/:itemId/questions/:questionId/ready`  
  - Body: `{ "ready_to_publish": true | false }`.  
  - Toggles a single question’s `ready_to_publish` without sending the full list. Optional if the UI only ever saves the full list with the flag set per question.

### 3.2 Backend behaviour

- When returning draft questions for a chapter, include `ready_to_publish` from `draft_questions`.
- When saving questions (PUT), persist `ready_to_publish` for each question.
- Publish script (see below) reads only draft questions where `ready_to_publish = true` for that chapter.

---

## 4. Questions Editor UI

### 4.1 Layout

- **Left:** Collapsible sidebar with the **list of questions** for the chapter, grouped into two sections:
  - **In Progress** – questions with `ready_to_publish = false`.
  - **Ready to Publish** – questions with `ready_to_publish = true`.
- **Right (main area):** When the user selects a question from the left, show the question + answer + rubric editor (existing form). A control (e.g. checkbox or button) “Mark ready to publish” / “Mark in progress” toggles that question’s flag and moves it between the two sections in the left list.

### 4.2 Behaviour

- **Mark as Ready to Publish:** Set `ready_to_publish = true` for that question; UI moves it under “Ready to Publish” in the left list. Persist via API (PATCH or PUT).
- **Mark as In Progress:** Set `ready_to_publish = false`; question moves back under “In Progress.”
- **Save:** Existing save continues to persist question text, model answer, rubric, etc.; can also persist `ready_to_publish` if not using a dedicated PATCH.
- The **curation item** “Mark Ready to Publish” (whole item) can remain optional for questions; the publish script does not use item status for questions—only per-question `ready_to_publish`.

### 4.3 SME-friendly rubric and node

- **Rubric form:** Difficulty, Difficulty Tag, Answer Input Type, and Match Mode use **subject-specific labels** (`curation-app/src/constants/rubricLabels.ts`). Question Type is read-only. Technical fields (rubric_version, block/criterion IDs) are in a collapsible "Advanced" section. Labels are defined for History/Civics; extensible per subject.
- **Syllabus node:** Shown in the right panel above Question Type. SME can **reassign** the question's node via a dropdown (full node tree; "Unassign" option). Single scrollable list with indentation.
- **MCQ blocks:** MCQs use a single rubric block (no duplicate blocks per question).

---

## 5. Chapter Images

Chapter-scoped images are used for **picture study** and **visual scenario** questions. One list per chapter; each image has a **slug** (unique per chapter) and optional **syllabus node** assignments. The question-bank generator (when run with `--from-db`) fetches image slug + published node IDs from the API for the 60% "within-structure" share.

### 5.1 Data model

- **`curation_chapter_images`:** id, chapter_id, url, filename, slug (unique per chapter), slug_locked (true after first save). Migration: `backend/scripts/schema-migration-chapter-images.sql`; run `npm run migration:chapter-images` from backend.
- **`curation_chapter_image_nodes`:** image_id, node_id (draft_syllabus_nodes). Many-to-many: an image can be assigned to one or more nodes. The API resolves draft node IDs to **published** syllabus_node_id when returning data for the question generator.

### 5.2 API

- **GET** `/curation/items/:id/chapter-images` — List images for the chapter (use the chapter's structure item id). Returns id, url, filename, slug, slug_locked, node_ids (published syllabus_node_ids).
- **POST** `/curation/items/:id/chapter-images` — Upload one image: multipart `file` + `slug`. Slug normalized (max 255 chars, spaces to underscore); unique per chapter. UI multi-upload derives slug from filename (no extension); duplicates skipped.
- **GET** `/curation/items/:id/structure-images` — For question generator: returns `{ slug, node_ids[] }` (published node IDs).
- **PATCH** `/curation/chapter-images/:imageId` — Update node_ids (body: `{ node_ids: string[] }`).
- **POST** `/curation/chapter-images/:imageId/replace` — Replace image file; slug unchanged.
- **DELETE** `/curation/chapter-images/:imageId` — Delete image and node mappings.

### 5.3 Images screen (UI)

- **Route:** `/item/:itemId/images`. List page shows **Images** link per chapter (structure item id).
- **Upload:** Multi-file; slug from filename (no extension), special chars to underscore. Duplicates skipped; "X uploaded, Y skipped (duplicate slug)". Progress "Uploading 1/N…".
- **List:** Thumbnail, slug, Assigned nodes. **Assign nodes** / **Edit (N)** opens dropdown with node tree (checkboxes). **Save nodes** at bottom of dropdown (scroll if needed). Outside click or opening another image closes picker; unsaved changes discarded.
- **Per image:** Replace image, Delete (confirm). Upload/replace persist immediately.

---

## 6. Structure + Study Notes Editor (Single Pane)

### 6.1 Three-column layout

Match the **Revision Notes** editor pattern (see `curation-app/src/pages/RevisionNotesEditor.tsx`):

| Column   | Content |
|----------|--------|
| **Left** | Structure tree (syllabus nodes for the chapter). Resizable. |
| **Middle** | Nodes and note blocks: list/edit blocks per node, drag-and-drop reorder, add/remove blocks. |
| **Right** | **HTML preview**: live render of the notes as the student would see (same as Revision Notes “Preview (as output)”). Resizable. |

- **Resizers:** Draggable dividers between left/middle and middle/right; persist widths in localStorage (e.g. same keys as revision notes or dedicated keys for structure+notes).

### 6.2 Reference implementation

- Revision Notes already has: `NotesTreeSidebar` (left), content area (middle), preview pane (right) with `previewWidth` and `handlePreviewResizeStart`. Reuse or mirror this layout for the **Combined Structure + Notes** editor (e.g. `CombinedStructureEditor` or equivalent) so that the “full extract” (structure + notes) is a single pane with an explicit third column for HTML preview.

---

## 7. Publish Script Behaviour

### 7.1 Structure and Notes (unchanged)

- **Structure:** For each curation item with content_type `structure` and status `ready_to_publish`, copy all `draft_syllabus_nodes` for that chapter to `syllabus_nodes` (replace existing for that chapter). Set item status to `published`.
- **Notes:** For each item `notes` in `ready_to_publish`, copy `draft_note_blocks` to `note_blocks` (mapping draft node IDs to published `syllabus_nodes`). Replace existing note_blocks for that chapter. Set item status to `published`.

### 7.2 Questions: incremental add/update only

- **Input:** Curation items with content_type `questions` and status `ready_to_publish` (or a dedicated “publish questions for chapter X” run; see note below).
- **Rule:** Publish **only** draft questions for that chapter where `draft_questions.ready_to_publish = true`.
- **Behaviour:**
  - Do **not** delete all published questions for the chapter. 
  - For each draft question with `ready_to_publish = true`:
    - If it has a `published_question_id`: **update** the existing published question (and its rubric) in place.
    - If it has no `published_question_id`: **insert** a new row into `questions` (and `rubrics`); set `draft_questions.published_question_id` to the new id.
  - Existing published questions that no longer have a corresponding draft with `ready_to_publish = true` are **left unchanged** (not deleted). Thus, adding more draft questions later and marking them ready only adds/updates those; it does not remove or overwrite other published questions.
- **Item status:** After publishing questions for a chapter, set the curation item status to `published` only if desired (e.g. when all intended questions for that run are published). Optional: allow item to stay `ready_to_publish` so admin can run publish again after more questions are marked ready.

### 7.3 Revision notes

- If revision_notes is a separate content_type, keep current replace-all behaviour for that chapter unless otherwise specified; this spec does not change revision notes publish logic.

---

## 8. Extraction: Single Script (Structure + Notes)

### 8.1 Requirement

- **One script** that, given chapter PDF(s) and any required config (board, grade, subject, book), produces in **one run**:
  - **Structure:** Syllabus nodes tree (chapters[].nodes).
  - **Notes:** Content blocks per node (nodes + content_blocks).
- Output format must be consumable by the existing **curation import** (or a single “import structure + notes” step) so that the curation app has one combined structure + notes experience.

### 8.2 Current state vs target

- **Current:** Syllabus extract (PDF → syllabus JSON) and study-notes extract (PDF + syllabus JSON → notes JSON) are two scripts and two passes.
- **Target:** Single script (or single pipeline) that performs both structure extraction and notes extraction in one run, reducing time and cost. Output may remain one JSON per chapter containing both `nodes` and `content_blocks` (or equivalent) so that one import creates draft_syllabus_nodes and draft_note_blocks.

### 7.3 Doc: “How to add a new chapter to curation”

Provide a short document (or section in this spec / STUDY_NOTES_FLOW) that describes:

1. **Prerequisites:** PDF(s) for the chapter; board, grade, subject, book identified.
2. **Run the single extraction script** (once implemented) with the correct inputs; output is one (or more) JSON files with structure + notes.
3. **Run curation import** (e.g. `npm run curation:import` from backend with path to script output) so that draft_syllabus_nodes, draft_note_blocks, and curation_items are created/updated.
4. **SME:** Open the curation app → select the chapter’s Structure (or combined Structure+Notes) item → edit → save → mark ready to publish when done. Then do the same for Notes if separate, or use the single pane. For questions, import questions (if any) then use the Questions editor; mark individual questions ready; admin runs publish.
5. **Admin:** Run publish script when items (and for questions, the desired set of questions) are ready.

This gives a clear “add a new chapter” flow without changing scope.

---

## 9. SME Workflow Summary

| Step | Action |
|------|--------|
| 1 | Log in (shared SME account). |
| 2 | See full list of curation items (by chapter and content type). |
| 3 | Open **Structure** (or combined Structure+Notes) for a chapter → edit tree and/or blocks → Save → Mark Ready to Publish when done. |
| 4 | Open **Revision Notes** for the chapter → edit blocks → Save → Mark Ready to Publish when done. |
| 5 | Open **Questions** for the chapter → for each question, edit and optionally “Mark ready to publish” (moves to Ready bucket); Save. |
| 6 | Admin runs publish script (structure first, then notes/revision_notes, then questions). For questions, only draft questions with `ready_to_publish = true` are published; existing published questions are not removed. |
| (optional) | Open **Images** for the chapter → upload images (slug from filename), assign nodes via "Assign nodes" → "Save nodes" at bottom of dropdown. Used by question generator for picture study / visual scenario. |

---

## 10. References

- Design overview: `docs/CURATION_SYSTEM.md`
- DB schema: `docs/DB_SCHEMA.md`, `backend/scripts/schema-mvp1.sql`
- Study notes flow (current): `docs/STUDY_NOTES_FLOW.md`
- Study note generation spec: `docs/STUDY_NOTE_GENERATION.md`
- Curation import: `backend/scripts/curation-import.ts`
- Curation publish: `backend/scripts/curation-publish.ts`
- Revision Notes UI (three-column reference): `curation-app/src/pages/RevisionNotesEditor.tsx`
- Combined Structure editor: `curation-app/src/pages/CombinedStructureEditor.tsx`
- Questions editor: `curation-app/src/pages/QuestionsEditor.tsx`
- Chapter Images editor: `curation-app/src/pages/ImagesEditor.tsx`
- Rubric labels (subject-specific): `curation-app/src/constants/rubricLabels.ts`
- Project context: `CURSOR_PROJECT_CONTEXT.md`
