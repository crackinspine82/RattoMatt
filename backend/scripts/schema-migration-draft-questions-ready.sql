-- Add ready_to_publish to draft_questions (per-question curation spec).
-- Run once on existing DBs: npm run migration:draft-questions-ready
-- New installs get this via schema-mvp1.sql.

ALTER TABLE draft_questions ADD COLUMN IF NOT EXISTS ready_to_publish BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_draft_questions_ready ON draft_questions(chapter_id, ready_to_publish);
