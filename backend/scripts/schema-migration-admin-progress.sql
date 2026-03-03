-- Add progress and ETA columns to admin_jobs (run after schema-migration-admin.sql).
-- From backend/: npm run migration:admin-progress

ALTER TABLE admin_jobs
  ADD COLUMN IF NOT EXISTS progress_pct INTEGER CHECK (progress_pct >= 0 AND progress_pct <= 100),
  ADD COLUMN IF NOT EXISTS progress_message TEXT,
  ADD COLUMN IF NOT EXISTS estimated_finished_at TIMESTAMPTZ;
