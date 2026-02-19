# RattoMatt Curation App

Web app for SMEs to curate syllabus structure and study notes. See `docs/CURATION_SYSTEM.md` for the full design.

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

4. Log in with the SME email/password, then open items (Structure or Notes), edit, Save, and Mark Ready to Publish.

5. **Publish** (after SME marks items ready):
   ```bash
   cd backend
   npm run curation:publish   # copies draft → published for ready_to_publish items
   ```

## Env

- `VITE_CURATION_API`: optional; if not set, the dev server proxies `/curation` to `http://localhost:3000`.
