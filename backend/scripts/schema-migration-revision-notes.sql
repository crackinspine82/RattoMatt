-- Migration: add revision_notes content type and draft_revision_note_blocks table.
-- Run once on existing DBs that have curation_items with the old CHECK.
-- New installs get this via schema-mvp1.sql.

-- Allow revision_notes in curation_items (drop and re-add CHECK)
ALTER TABLE curation_items DROP CONSTRAINT IF EXISTS curation_items_content_type_check;
ALTER TABLE curation_items ADD CONSTRAINT curation_items_content_type_check
  CHECK (content_type IN ('structure', 'notes', 'questions', 'rubrics', 'revision_notes'));

-- Revision note blocks (concise revision from study-notes-generate)
CREATE TABLE IF NOT EXISTS draft_revision_note_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_syllabus_node_id UUID REFERENCES draft_syllabus_nodes(id) NOT NULL,
  sequence_number INTEGER NOT NULL,
  content_html TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_draft_revision_note_blocks_node ON draft_revision_note_blocks(draft_syllabus_node_id);
