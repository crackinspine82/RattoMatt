# Ports and apps

| App / process        | Port | Notes |
|----------------------|------|--------|
| **Backend (API)**    | 3000 | Single Fastify server: `/curation`, `/admin`, subjects, reminders, uploads. Start: `cd backend && npm run dev`. |
| **Admin app (Vite)**  | 5175 | Proxies `/admin` → `http://localhost:3000`. Start: `cd admin-app && npm run dev`. |
| **Curation app (Vite)** | 5174 | Proxies `/curation`, `/uploads` → `http://localhost:3000`. Start: `cd curation-app && npm run dev`. |
| **Mobile**           | —    | Client only; uses `API_BASE_URL` (e.g. `http://localhost:3000` or deployed API). |

No port conflicts: only the backend listens on 3000; admin and curation are dev UIs on 5175 and 5174.

Scripts that call the API (e.g. question-bank `--from-db`) use `CURATION_API_URL` from `backend/.env` (default `http://127.0.0.1:3000` on Windows to avoid localhost IPv6 issues). Ensure the backend is running before running those scripts.
