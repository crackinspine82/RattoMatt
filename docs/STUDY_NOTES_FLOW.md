# Study notes flow (step by step)

Run these from the **repo root** unless noted.

Syllabus and notes use a **nested node tree** (unlimited depth). Level labels: Section (0), Topic (1), Subtopic (2), Point (3), Sub-point (4+). Notes are stored as **note_blocks** per syllabus_node (multiple blocks per node).

---

## Step 1: Syllabus extract

Produces one syllabus JSON per book in `scripts/syllabus-extract/out/`. Each chapter has **nodes** (nested tree) instead of flat topics/micro_topics.

```bash
cd scripts/syllabus-extract
npm run extract
# Or dry-run: npm run extract:dry
```

---

## Step 2: Study-notes extract

Reads chapter PDFs + syllabus JSON, reconciles outline (does **not** overwrite syllabus). Extracts notes **per syllabus node** (multiple content_blocks). Writes per chapter: **notes JSON** (nodes + content_blocks; additional_sections for PDF-only content) and **notes_manifest JSON** (syllabus_leaves with has_notes, stray_leaves from in_pdf_only).

**Requires:** `GEMINI_API_KEY` (in `scripts/study-notes-extract/.env` or env). Optional: `GEMINI_MODEL` (default `gemini-2.0-flash`; set to `gemini-2.5-pro` for higher-quality outline matching and notes, at higher cost and latency).

```bash
cd scripts/study-notes-extract
npm install
npm run extract
# Limit to one book: npm run extract -- --book=TotalGeography_MorningStar_JasmineRachel
# Dry-run (no API): npm run dry-run
```

---

## Step 3: Upsert syllabus to DB

Syncs syllabus JSON to **syllabus_nodes** (and subject/chapters). Supports both **chapters[].nodes** (nested) and legacy **chapters[].topics**. Study-notes extract does not modify the syllabus file; use the manifest to see which leaves have notes vs strays. Optionally run a separate “merge strays” step to add PDF-only sections to the syllabus before re-running Step 3.

**Requires:** `DATABASE_URL` in `backend/.env`.

```bash
cd backend
npm run seed:upsert-syllabus -- ../scripts/syllabus-extract/out/syllabus_ICSE_9_Geography_TotalGeography_MorningStar_JasmineRachel.json
```

---

## Step 4: Seed study-notes into DB

Loads notes JSON(s): if **nodes** present, inserts into **note_blocks** (per syllabus_node). Legacy **notes[]** format still writes to **notes** table.

```bash
cd backend
npm run seed:study-notes
# Or: npm run seed:study-notes -- ../scripts/study-notes-extract/out
```

---

## Order

1. Syllabus extract → syllabus JSON (chapters[].nodes).
2. Study-notes extract → notes JSON (nodes with content_blocks; may update syllabus JSON).
3. Upsert syllabus → syllabus_nodes in DB.
4. Seed study-notes → note_blocks in DB.
