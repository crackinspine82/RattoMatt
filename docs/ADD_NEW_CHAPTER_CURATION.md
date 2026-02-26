# How to add a new chapter to curation

This document describes the steps to add a new chapter so SMEs can curate it in the curation app. It assumes you have PDF(s) for the chapter and know the board, grade, subject, and book.

---

## Prerequisites

- **Chapter PDF(s)** for the book (e.g. one PDF per chapter, or one combined PDF).
- **Board, grade, subject, book** identified (e.g. ICSE, 9, History & Civics, Total History & Civics).
- **Backend** with `DATABASE_URL` in `backend/.env`.
- **Syllabus extract** and **study-notes extract** scripts configured (see `docs/STUDY_NOTES_FLOW.md`).

---

## Step 1: Extract structure and notes

1. **Syllabus extract** – Produces syllabus JSON (chapters with nested nodes) from the book PDFs.

   ```bash
   cd scripts/syllabus-extract
   npm run extract
   ```

   Output: `scripts/syllabus-extract/out/syllabus_<board>_<grade>_<subject>_<book>.json` (or similar).

2. **Study-notes extract** – Produces notes JSON (nodes + content_blocks per chapter) using the syllabus and chapter PDFs.

   ```bash
   cd scripts/study-notes-extract
   npm run extract
   # Or limit to one book: npm run extract -- --book=...
   ```

   Output: per-chapter notes JSON in the script’s output folder.

See `docs/STUDY_NOTES_FLOW.md` for details and env vars (e.g. `GEMINI_API_KEY`).

---

## Step 2: Import into curation (draft tables + curation items)

From the **backend** folder, run the curation import so that draft tables and `curation_items` are created or updated for the chapter(s).

```bash
cd backend
# Default dirs: ../scripts/syllabus-extract/out, ../scripts/study-notes-extract/out
npm run curation:import
# Or pass dirs: npm run curation:import -- ../scripts/syllabus-extract/out ../scripts/study-notes-extract/out
```

This will:

- Ensure **subjects** and **chapters** exist (from syllabus JSON in the syllabus dir).
- Create or replace **draft_syllabus_nodes** (from syllabus) and **draft_note_blocks** (from notes). Syllabus import replaces nodes and blocks per chapter; notes import **replaces** full-extract blocks per chapter (clear then insert), so re-running does not duplicate blocks.
- Create or update **curation_items** for each (chapter, content_type): structure, notes, and optionally questions if you pass a questions dir.

**Note:** This flow uses **curation import** (draft tables); it does not use `seed:study-notes` (which writes directly to published tables). Use curation import so SMEs can edit before publish.

To import **only notes** (e.g. after re-running study-notes extract):

```bash
npm run curation:import -- --notes-only ../scripts/study-notes-extract/out
```

`--notes-only` replaces full-extract blocks for each chapter (clears then inserts), so it is safe to re-run after re-extracting notes without creating duplicate blocks.

To import **only questions** (chapters must already exist; run syllabus/notes import first):

```bash
npm run curation:import -- --questions-only ../scripts/question-bank-generate/out
```

See `docs/QUESTION_BANK_GENERATION.md` and `backend/scripts/curation-import.ts` for details.

---

## Step 3: SME curation in the app

1. Log in to the **curation app** (shared SME account).
2. Open the **list** of curation items; find the new chapter’s items (Structure, Notes, Revision notes, Questions, Images).
3. **Structure (syllabus + full extract):**
   - Open the **Structure** item for that chapter.
   - Edit the tree (levels, reparent, add/remove nodes, edit titles), edit note blocks in the middle column, and use the **Preview** column on the right to see output.
   - **Save**, then **Mark Ready to Publish** when done.
4. **Revision notes:** Open the Revision Notes item, edit blocks, Save, Mark Ready to Publish when done.
5. **Chapter images (optional):** Open the **Images** link for the chapter. Upload images (slug is set from filename); use “Assign nodes” and click **Save nodes** at the bottom of the dropdown to map each image to syllabus nodes. Used by the question generator for picture study and visual scenario questions.
6. **Questions:** Open the Questions item. Use the left sidebar: **In Progress** and **Ready to Publish**. Edit each question and use **Mark ready to publish** or **Mark in progress** per question. **Save** to persist edits. Only questions in **Ready to Publish** will be published when the admin runs the publish script. You can **reassign** a question’s syllabus node from the right panel (dropdown with full node tree; “Unassign” option).

---

## Step 4: Admin runs publish

When items (and for questions, the desired set of questions) are ready:

```bash
cd backend
npm run curation:publish
```

This publishes all curation items with status **ready_to_publish**:

- **Structure:** draft_syllabus_nodes → syllabus_nodes (replace for that chapter).
- **Notes:** draft_note_blocks → note_blocks (replace for that chapter).
- **Revision notes:** draft_revision_note_blocks → published (if applicable).
- **Questions:** Only draft questions with **ready_to_publish = true** are published; they are added or updated in `questions` (incremental). Existing published questions for the chapter are not removed.

After publishing, set the curation item status to **published** (the script does this). The app (mobile/parent) will then see the published content.

---

## Optional: Run migration for per-question ready

If the backend DB was created before the curation spec (per-question ready_to_publish), run:

```bash
cd backend
npm run migration:draft-questions-ready
```

---

## References

- `docs/STUDY_NOTES_FLOW.md` – Syllabus and study-notes extraction.
- `docs/CURATION_SYSTEM.md` – Curation design.
- `docs/CURATION_SPEC.md` – Implementation spec (per-question ready, incremental publish, three-column layout).
- `docs/QUESTION_BANK_GENERATION.md` – Generating and importing questions.
