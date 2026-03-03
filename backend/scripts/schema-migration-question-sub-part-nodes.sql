-- Per-sub-part syllabus nodes for structured_essay (i/ii/iii). Enables accurate mastery per node.
-- See docs: structured essay sub-questions can map to different nodes (e.g. Events at Meerut, Delhi, Lucknow).

-- Draft (curation): one row per (draft_question_id, sub_part_key)
CREATE TABLE IF NOT EXISTS draft_question_sub_part_nodes (
  draft_question_id UUID NOT NULL REFERENCES draft_questions(id) ON DELETE CASCADE,
  sub_part_key VARCHAR(10) NOT NULL CHECK (sub_part_key IN ('i', 'ii', 'iii')),
  syllabus_node_id UUID REFERENCES syllabus_nodes(id) ON DELETE SET NULL,
  PRIMARY KEY (draft_question_id, sub_part_key)
);
CREATE INDEX IF NOT EXISTS idx_draft_question_sub_part_nodes_draft ON draft_question_sub_part_nodes(draft_question_id);
CREATE INDEX IF NOT EXISTS idx_draft_question_sub_part_nodes_node ON draft_question_sub_part_nodes(syllabus_node_id);

-- Published: one row per (question_id, sub_part_key)
CREATE TABLE IF NOT EXISTS question_sub_part_nodes (
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  sub_part_key VARCHAR(10) NOT NULL CHECK (sub_part_key IN ('i', 'ii', 'iii')),
  syllabus_node_id UUID REFERENCES syllabus_nodes(id) ON DELETE SET NULL,
  PRIMARY KEY (question_id, sub_part_key)
);
CREATE INDEX IF NOT EXISTS idx_question_sub_part_nodes_question ON question_sub_part_nodes(question_id);
CREATE INDEX IF NOT EXISTS idx_question_sub_part_nodes_node ON question_sub_part_nodes(syllabus_node_id);
