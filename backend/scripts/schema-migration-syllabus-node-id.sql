-- Migration: draft_revision_note_blocks and draft_questions keyed by syllabus_node_id (published).
-- Run after truncating/clearing draft revision blocks and draft questions (fresh start).
-- See docs/TARGET_ARCHITECTURE_REVISION_QUESTIONS.md.
-- Orphaned: syllabus_node_id nullable with ON DELETE SET NULL so re-publish keeps drafts under "Orphaned".

-- draft_revision_note_blocks: switch to syllabus_node_id; add chapter_id for listing/orphaned
ALTER TABLE draft_revision_note_blocks ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES chapters(id);
ALTER TABLE draft_revision_note_blocks ADD COLUMN IF NOT EXISTS syllabus_node_id UUID REFERENCES syllabus_nodes(id) ON DELETE SET NULL;
ALTER TABLE draft_revision_note_blocks DROP COLUMN IF EXISTS draft_syllabus_node_id;
-- Ensure chapter_id NOT NULL (set from syllabus_nodes join for existing rows if any; else leave for fresh install)
-- ALTER TABLE draft_revision_note_blocks ALTER COLUMN chapter_id SET NOT NULL; -- run only if backfilled
CREATE INDEX IF NOT EXISTS idx_draft_revision_note_blocks_syllabus_node ON draft_revision_note_blocks(syllabus_node_id);
CREATE INDEX IF NOT EXISTS idx_draft_revision_note_blocks_chapter ON draft_revision_note_blocks(chapter_id);

-- draft_questions: switch to syllabus_node_id (nullable for orphaned)
ALTER TABLE draft_questions ADD COLUMN IF NOT EXISTS syllabus_node_id UUID REFERENCES syllabus_nodes(id) ON DELETE SET NULL;
ALTER TABLE draft_questions DROP COLUMN IF EXISTS draft_syllabus_node_id;
CREATE INDEX IF NOT EXISTS idx_draft_questions_syllabus_node ON draft_questions(syllabus_node_id);

-- Published revision notes (publish script copies draft_revision_note_blocks here)
CREATE TABLE IF NOT EXISTS revision_note_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  syllabus_node_id UUID REFERENCES syllabus_nodes(id) NOT NULL,
  sequence_number INTEGER NOT NULL,
  content_html TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revision_note_blocks_node ON revision_note_blocks(syllabus_node_id);
