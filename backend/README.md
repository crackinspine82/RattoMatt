# RattoMatt Backend

TypeScript + Fastify + Postgres. Implements API_SPEC_MVP1 for subjects, chapters, and reminders.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Apply the MVP1 schema to your database (Neon or local Postgres):

   ```bash
   npm run schema:apply
   ```

   This runs `scripts/schema-mvp1.sql` (full DDL from `docs/DB_SCHEMA.md` plus `student_subjects`). Uses `DATABASE_URL` from `.env`. Idempotent (IF NOT EXISTS).

4. Seed `subjects`, `chapters`, `topics`, and `micro_topics` from a syllabus JSON (see step 5).

## Run

- Dev: `npm run dev` (tsx watch)
- Build: `npm run build` then `npm start`

API listens on `PORT` (default 3000). Endpoints:

- `GET /subjects?board=ICSE&grade=10&student_id=...`
- `GET /subjects/:id/chapters`
- `POST /reminders`, `GET /reminders?student_id=...&status=scheduled`, `GET /reminders/:id`, `PATCH /reminders/:id`

## Seed from syllabus JSON

1. Run syllabus extraction for one book (from repo root):  
   `cd scripts/syllabus-extract` then set `GEMINI_API_KEY` and run  
   `node extract.mjs --book=TotalHistoryCivics_MorningStar_DollyESequeira`  
   Output: `scripts/syllabus-extract/out/syllabus_ICSE_9_HistoryCivics_TotalHistoryCivics_MorningStar_DollyESequeira.json` (or the book you chose).

2. From the backend folder, seed Postgres:  
   `DATABASE_URL=postgresql://... npm run seed:syllabus -- ../scripts/syllabus-extract/out/syllabus_ICSE_9_HistoryCivics_TotalHistoryCivics_MorningStar_DollyESequeira.json`  
   Or: `npx tsx scripts/seed-from-syllabus.ts <path-to-syllabus.json>` with `DATABASE_URL` set.

   The script upserts the subject (by board, grade, book name), clears existing chapters/topics/micro_topics for that subject, then inserts from the JSON.
