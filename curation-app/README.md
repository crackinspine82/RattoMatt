# RattoMatt Curation App

Web app for SMEs to curate syllabus structure, study notes, revision notes, questions, and chapter images. See `docs/CURATION_SYSTEM.md` for design and `docs/CURATION_SPEC.md` for implementation (per-question ready, chapter images, SME-friendly rubric).

## Setup

1. **Backend** must be running with curation schema and routes (from repo root):
   ```bash
   cd backend
   npm run schema:apply   # applies schema including curation tables
   npm run seed:sme-user -- sme@example.com yourpassword   # create an SME user
   npm run dev            # start API on http://localhost:3000
   ```

2. **Import content** (after running syllabus + study-notes extract scripts):
   ```bash
   cd backend
   npm run curation:import   # reads ../scripts/syllabus-extract/out and ../scripts/study-notes-extract/out
   ```

3. **Curation app** (this folder):
   ```bash
   cd curation-app
   npm install
   npm run dev   # http://localhost:5174, proxies /curation to backend
   ```

4. Log in with the SME email/password. Open items: **Structure** (syllabus + full extract), **Revision notes**, **Questions** (per-question ready to publish, node reassignment, rubric), **Images** (upload images, slug from filename, assign nodes for picture study / visual scenario). Edit, Save, and Mark Ready to Publish where applicable.

5. **Publish** (after SME marks items ready):
   ```bash
   cd backend
   npm run curation:publish   # copies draft → published for ready_to_publish items
   ```

## Env

- `VITE_CURATION_API`: optional; if not set, the dev server proxies `/curation` to `http://localhost:3000`.
