# Technical Rules (MVP1)

These rules prevent technical debt and data bloat. Treat them as hard
constraints unless explicitly overridden by the product owner.

## 1) Storage and PDFs
- Do not store PDFs in PostgreSQL (no BLOBs).
- Store PDFs in object storage and save only the URL in DB.
- Use expiring signed URLs for access when feasible.
- Academic year data is deprecated on June 1 of the next year.
- Admins can delete deprecated academic years to reduce storage.

## 2) Database Growth Controls
- Partition high-growth tables by date from day 1:
  - papers
  - paper_questions
  - question_attempts
- Keep audit logs minimal to avoid bloat.
- Repeat-avoidance should use a recent window and caching
  (no per-student per-question full history table).

## 3) Async Analytics
- All aggregate updates must be handled asynchronously via workers/events.
- Never compute analytics in the request/response path.

## 4) Schema Extensibility
- Question types are subject-specific and must be extensible.
- Support multi-part questions and shared stimulus.
- Rubrics must be weighted bullets and support partial marks.
 - Store rubrics as structured JSON (JSONB) to support AI grading.
 - Semantic credit must map to rubric criteria; no new points can be invented.
 - Spelling deductions apply across all subjects (capped to avoid over-penalty).
- Each question stores difficulty_level (1-4). Display labels are derived:
  1=easy, 2=medium, 3=difficult, 4=complex.
- Difficulty is orthogonal to question type (any type can be any difficulty).
- Use snake_case canonical IDs for question types.
- scenario_data is optional in DB but required by validation for logic tables.
- Track question discipline (history/civics) for selection ratios.
 - Store question source_type for free-tier gating.
- Question edits overwrite existing records (no versioning).
- Prefer rubrics in a separate table linked by question_id for scale.
 - Provide difficulty_tag in rubric JSON as a derived field for AI grading.
 - Pricing windows are stored in a dedicated table for admin scheduling.

## 5) Performance and Cost Controls
- Prefer immediate PDF availability after Take Test.
- Use cache + DB window for repeat-avoidance to avoid large tables.
 - Cap free-tier paper generation and RapidFire sessions to limit bloat.

## 6) Security and Privacy
- Collect only minimal personal data (parent email, student first name).
- School data is used for aggregation only; do not expose to parents.
- Student mode is in-app lock only (no OS-level kiosk).

## 7) Admin Uploads
- Bulk upload must validate templates and show row-level errors before ingest.
- Images/media should be supported via mapping (e.g., ZIP + CSV/XLSX).

## 8) Typography and Fonts
- App UI headings/titles/buttons: Montserrat (Semi-Bold/Bold).
- App UI body text: Lato Regular (use Lato Semi-Bold for emphasis).
- Printed materials (question papers, answer sheets, study notes, answer keys, etc.)
  must use Tinos Regular/Bold with fonts embedded in the PDF output.

## 9) Student's Subjects Ordering
- Popularity for "(StudentName)'s Subjects" is computed per (board, grade, author); authors are school-specific (especially grades 9 and 10).
- API returns subjects for the student's board and grade, ordered by subscription count (or weight) per (board, grade, author).
