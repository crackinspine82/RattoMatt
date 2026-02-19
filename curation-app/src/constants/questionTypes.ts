/** Human-readable labels for question type canonical IDs (History & Civics). */
export const QUESTION_TYPE_LABELS: Record<string, string> = {
  mcq_standard: 'MCQ standard',
  mcq_logic_table: 'MCQ logic table',
  mcq_visual_scenario: 'MCQ visual scenario',
  mcq_assertion_reason: 'MCQ assertion-reason',
  mcq_source_connection: 'MCQ source connection',
  mcq_odd_one_out: 'MCQ odd one out',
  mcq_chronology_sequence: 'MCQ chronology/sequence',
  mcq_relationship_analogy: 'MCQ relationship/analogy',
  match_columns: 'Match columns',
  short_answer: 'Short answer',
  structured_essay: 'Structured essay',
  picture_study_linked: 'Picture study linked',
  source_passage_analysis: 'Source passage analysis',
  deductive_application: 'Deductive application',
};

/** Display order: MCQs first (by type), then short answer, then longer types. */
export const QUESTION_TYPE_ORDER: string[] = [
  'mcq_standard',
  'mcq_logic_table',
  'mcq_visual_scenario',
  'mcq_assertion_reason',
  'mcq_source_connection',
  'mcq_odd_one_out',
  'mcq_chronology_sequence',
  'mcq_relationship_analogy',
  'short_answer',
  'match_columns',
  'structured_essay',
  'picture_study_linked',
  'source_passage_analysis',
  'deductive_application',
];

/** Category labels for sidebar grouping (MCQs, Short answer, Longer). */
export const QUESTION_TYPE_CATEGORY: Record<string, 'MCQs' | 'Short answer' | 'Longer'> = {
  mcq_standard: 'MCQs',
  mcq_logic_table: 'MCQs',
  mcq_visual_scenario: 'MCQs',
  mcq_assertion_reason: 'MCQs',
  mcq_source_connection: 'MCQs',
  mcq_odd_one_out: 'MCQs',
  mcq_chronology_sequence: 'MCQs',
  mcq_relationship_analogy: 'MCQs',
  short_answer: 'Short answer',
  match_columns: 'Longer',
  structured_essay: 'Longer',
  picture_study_linked: 'Longer',
  source_passage_analysis: 'Longer',
  deductive_application: 'Longer',
};

export function questionTypeToLabel(typeId: string): string {
  return QUESTION_TYPE_LABELS[typeId] ?? typeId.replace(/_/g, ' ');
}

export const DIFFICULTY_TAG_LABELS: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  difficult: 'Difficult',
  complex: 'Complex',
};
