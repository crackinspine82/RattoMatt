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

## Curation

- **Schema:** Curation tables (draft_*, curation_items, curation_chapter_images, curation_chapter_image_nodes) are in `scripts/schema-mvp1.sql` and `scripts/schema-migration-chapter-images.sql`. Run `npm run migration:chapter-images` once to create chapter image tables.
- **Routes:** `/curation/login`, `/curation/items`, `/curation/items/:id/structure`, `/curation/items/:id/chapter-images`, `/curation/items/:id/structure-images` (for question generator), `/curation/chapter-images/:imageId` (PATCH nodes, POST replace, DELETE). See `docs/CURATION_SPEC.md`.
- **Scripts:** `npm run curation:import`, `npm run curation:publish`, `npm run curation:merge-questions-node-ids`, etc. See `docs/ADD_NEW_CHAPTER_CURATION.md`.

## API keys for scripts (long-lived, no re-login)

Question-bank generator (and any job that calls the curation API for structure-images) can use long-lived keys so admins don’t need to log into the curation app or refresh tokens.

| Purpose | Server env (backend `.env`) | Client env (where script runs) |
|--------|------------------------------|---------------------------------|
| **Admin path** (recommended) | `ADMIN_API_KEY=<secret>` | `ADMIN_API_TOKEN=<same secret>` |
| **Curation path** | `CURATION_SCRIPT_API_KEY=<secret>` | `CURATION_API_TOKEN=<same secret>` |

- Generate a secret once (e.g. `openssl rand -hex 32`). Set it in backend `.env` and in the environment where the script/job runs (e.g. same `.env` if running from repo; or your orchestrator’s env/secrets).
- **Containers:** Set the same variables via your runtime (Docker `env_file` or `environment`, Kubernetes `env` from `Secret`, etc.). Do not commit real secrets to the repo.
- **Rotate:** Change the value in both places and restart the backend (and any job runner).
