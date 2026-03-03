# Deploy Admin App on Vercel

The admin app is a Vite + React SPA that talks to your deployed backend.

## Prerequisites

- Backend already deployed (e.g. `https://your-api.example.com`).
- Vercel account and CLI optional (you can use the Vercel dashboard and “Import Git repository”).

## 1. Connect repository

- In [Vercel](https://vercel.com), create a new project and import `RattoMatt`.
- Set **Root Directory** to `admin-app` (so build runs from that folder).

## 2. Build settings (optional)

If you use the repo’s `admin-app/vercel.json`, Vercel will use:

- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Rewrites:** all routes → `/index.html` (SPA)

You can leave Framework Preset as “Vite” or override with the above.

## 3. Environment variable

Add in Vercel → Project → Settings → Environment Variables:

| Name              | Value                         | Environments   |
|-------------------|-------------------------------|----------------|
| `VITE_ADMIN_API`  | `https://your-backend-url.com`| Production (and Preview if needed) |

Use your real backend URL **with no trailing slash** (e.g. `https://api.rattomatt.com`).  
The admin app uses this for all `/admin/*` API calls.

## 4. Deploy

- Push to `main` (or your production branch) to trigger a production deploy.
- Or use **Redeploy** in the Vercel dashboard after changing env vars.

## 5. Post-deploy

- Open the Vercel app URL and log in with your admin credentials (same as backend `/admin/login`).
- If you see network errors, check that `VITE_ADMIN_API` matches the backend URL and that the backend allows the admin app’s origin (CORS) if required.
