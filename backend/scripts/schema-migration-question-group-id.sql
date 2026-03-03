-- Migration: question_group_id for grouping paired questions (same node/subnodes when insufficient points).
-- One UUID per group; questions in the same group share the same question_group_id.

ALTER TABLE draft_questions ADD COLUMN IF NOT EXISTS question_group_id UUID;
CREATE INDEX IF NOT EXISTS idx_draft_questions_question_group ON draft_questions(question_group_id);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_group_id UUID;
CREATE INDEX IF NOT EXISTS idx_questions_question_group ON questions(question_group_id);
