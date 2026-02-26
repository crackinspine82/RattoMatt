/**
 * Subject-specific rubric labels for SME-friendly UI.
 * Key by subject_id; use 'default' for unknown subjects (History/Civics).
 * Add new subjects by extending RUBRIC_LABELS and passing subjectId from the item.
 */

export type MatchModeOption = { value: string; label: string };

export type RubricLabelSet = {
  matchModeOptions: MatchModeOption[];
  difficultyLevelLabels: Record<number, string>;
  difficultyTagLabels: Record<string, string>;
  answerInputTypeOptions: { value: string; label: string }[];
};

/** History & Civics (and default for any unknown subject). */
const historyCivicsLabels: RubricLabelSet = {
  matchModeOptions: [
    { value: 'exact', label: 'Answer must match exactly' },
    { value: 'keyword_match', label: 'Match by keywords (any of these phrases)' },
    { value: 'keyword', label: 'Match by keywords' },
    { value: 'sequence', label: 'Match in order (sequence matters)' },
    { value: 'semantic', label: 'Match by meaning (similar words count)' },
  ],
  difficultyLevelLabels: {
    1: 'Easy',
    2: 'Medium',
    3: 'Difficult',
    4: 'Complex',
  },
  difficultyTagLabels: {
    easy: 'Easy',
    medium: 'Medium',
    difficult: 'Difficult',
    complex: 'Complex',
  },
  answerInputTypeOptions: [
    { value: 'typed', label: 'Student types answer' },
    { value: 'choice', label: 'Student picks one option (MCQ)' },
  ],
};

const RUBRIC_LABELS: Record<string, RubricLabelSet> = {
  default: historyCivicsLabels,
};

/**
 * Returns the label set for the given subject. Uses 'default' (History/Civics) when subjectId is missing or unknown.
 */
export function getRubricLabels(subjectId?: string | null): RubricLabelSet {
  if (subjectId && RUBRIC_LABELS[subjectId]) return RUBRIC_LABELS[subjectId];
  return RUBRIC_LABELS.default;
}

/**
 * All known match_mode values for dropdown; unknown values preserved as "Other: <value>".
 */
export function getMatchModeOptions(labels: RubricLabelSet, currentValue: string): MatchModeOption[] {
  const known = new Set(labels.matchModeOptions.map((o) => o.value));
  const options = [...labels.matchModeOptions];
  if (currentValue && !known.has(currentValue)) {
    options.push({ value: currentValue, label: `Other: ${currentValue}` });
  }
  return options;
}
