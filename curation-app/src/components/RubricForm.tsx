import { questionTypeToLabel } from '../constants/questionTypes';

/** Minimal rubric shape for form editing (matches content model). */
export type RubricBlock = {
  id: string;
  label: string;
  selection?: { min?: number; max?: number };
  match_mode?: string;
  criteria?: Array<{ id: string; keywords?: string[]; score?: number }>;
};

export type RubricAnswerKey = {
  correct_option?: string;
  logic_explanation?: string;
};

export type RubricFormData = {
  rubric_version?: number;
  total_marks?: number;
  question_type?: string;
  difficulty_level?: number;
  difficulty_tag?: string;
  answer_input_type?: string;
  blocks?: RubricBlock[];
  answer_key?: RubricAnswerKey;
  penalties?: unknown;
  scoring_rules?: unknown;
};

function getRubricFormData(rubric: Record<string, unknown>): RubricFormData {
  return {
    rubric_version: typeof rubric.rubric_version === 'number' ? rubric.rubric_version : 2,
    total_marks: typeof rubric.total_marks === 'number' ? rubric.total_marks : 0,
    question_type: typeof rubric.question_type === 'string' ? rubric.question_type : '',
    difficulty_level: typeof rubric.difficulty_level === 'number' ? rubric.difficulty_level : 1,
    difficulty_tag: typeof rubric.difficulty_tag === 'string' ? rubric.difficulty_tag : 'easy',
    answer_input_type: typeof rubric.answer_input_type === 'string' ? rubric.answer_input_type : '',
    blocks: Array.isArray(rubric.blocks)
      ? (rubric.blocks as RubricBlock[]).map((b) => ({
          id: typeof b.id === 'string' ? b.id : '',
          label: typeof b.label === 'string' ? b.label : '',
          selection:
            b.selection && typeof b.selection === 'object'
              ? {
                  min: typeof (b.selection as { min?: number }).min === 'number' ? (b.selection as { min: number }).min : 1,
                  max: typeof (b.selection as { max?: number }).max === 'number' ? (b.selection as { max: number }).max : 1,
                }
              : { min: 1, max: 1 },
          match_mode: typeof b.match_mode === 'string' ? b.match_mode : 'exact',
          criteria: Array.isArray(b.criteria)
            ? (b.criteria as Array<{ id?: string; keywords?: string[]; score?: number }>).map((c) => ({
                id: typeof c.id === 'string' ? c.id : '',
                keywords: Array.isArray(c.keywords) ? c.keywords : [],
                score: typeof c.score === 'number' ? c.score : 0,
              }))
            : [],
        }))
      : [],
    answer_key:
      rubric.answer_key && typeof rubric.answer_key === 'object'
        ? {
            correct_option: typeof (rubric.answer_key as RubricAnswerKey).correct_option === 'string' ? (rubric.answer_key as RubricAnswerKey).correct_option : '',
            logic_explanation: typeof (rubric.answer_key as RubricAnswerKey).logic_explanation === 'string' ? (rubric.answer_key as RubricAnswerKey).logic_explanation : '',
          }
        : undefined,
    penalties: rubric.penalties,
    scoring_rules: rubric.scoring_rules,
  };
}

function formDataToRubric(data: RubricFormData): Record<string, unknown> {
  const rubric: Record<string, unknown> = {
    rubric_version: data.rubric_version ?? 2,
    total_marks: data.total_marks ?? 0,
    question_type: data.question_type ?? '',
    difficulty_level: data.difficulty_level ?? 1,
    difficulty_tag: data.difficulty_tag ?? 'easy',
    answer_input_type: data.answer_input_type ?? '',
    blocks:
      data.blocks?.map((b) => ({
        id: b.id,
        label: b.label,
        selection: b.selection ?? { min: 1, max: 1 },
        match_mode: b.match_mode ?? 'exact',
        criteria:
          b.criteria?.map((c) => ({
            id: c.id,
            keywords: c.keywords ?? [],
            score: c.score ?? 0,
          })) ?? [],
      })) ?? [],
  };
  if (data.answer_key && (data.answer_key.correct_option || data.answer_key.logic_explanation)) {
    rubric.answer_key = data.answer_key;
  }
  if (data.penalties !== undefined) rubric.penalties = data.penalties;
  if (data.scoring_rules !== undefined) rubric.scoring_rules = data.scoring_rules;
  return rubric;
}

const inputStyle = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 14,
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--bg)',
  color: 'var(--text)',
} as const;

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 } as const;

type Props = {
  rubric: Record<string, unknown>;
  onChange: (rubric: Record<string, unknown>) => void;
};

export function RubricForm({ rubric, onChange }: Props) {
  const data = getRubricFormData(rubric);

  function update(partial: Partial<RubricFormData>) {
    const next = { ...data, ...partial };
    onChange(formDataToRubric(next));
  }

  function updateBlock(index: number, partial: Partial<RubricBlock>) {
    const blocks = [...(data.blocks ?? [])];
    blocks[index] = { ...blocks[index], ...partial };
    update({ blocks });
  }

  function updateCriterion(blockIndex: number, critIndex: number, partial: Partial<{ id: string; keywords: string[]; score: number }>) {
    const blocks = [...(data.blocks ?? [])];
    const block = blocks[blockIndex];
    const criteria = [...(block.criteria ?? [])];
    criteria[critIndex] = { ...criteria[critIndex], ...partial };
    blocks[blockIndex] = { ...block, criteria };
    update({ blocks });
  }

  const isChoiceType =
    (data.answer_input_type ?? '').toLowerCase() === 'choice' ||
    (data.question_type ?? '').toLowerCase().includes('mcq');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
      <div>
        <label style={labelStyle}>Question type</label>
        <input
          type="text"
          value={data.question_type ?? ''}
          onChange={(e) => update({ question_type: e.target.value })}
          list="question-type-list"
          style={inputStyle}
        />
        <datalist id="question-type-list">
          {['mcq_standard', 'short_answer', 'structured_essay', 'picture_study_linked', 'source_passage_analysis', 'deductive_application'].map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {data.question_type && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>
            {questionTypeToLabel(data.question_type)}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Difficulty level (1–4)</label>
          <input
            type="number"
            min={1}
            max={4}
            value={data.difficulty_level ?? 1}
            onChange={(e) => update({ difficulty_level: parseInt(e.target.value, 10) || 1 })}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Difficulty tag</label>
          <select
            value={data.difficulty_tag ?? 'easy'}
            onChange={(e) => update({ difficulty_tag: e.target.value })}
            style={inputStyle}
          >
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="difficult">difficult</option>
            <option value="complex">complex</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Answer input type</label>
          <input
            type="text"
            value={data.answer_input_type ?? ''}
            onChange={(e) => update({ answer_input_type: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Total marks</label>
          <input
            type="number"
            min={0}
            value={data.total_marks ?? 0}
            onChange={(e) => update({ total_marks: parseInt(e.target.value, 10) || 0 })}
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Rubric version</label>
        <input
          type="number"
          min={1}
          value={data.rubric_version ?? 2}
          onChange={(e) => update({ rubric_version: parseInt(e.target.value, 10) || 2 })}
          style={inputStyle}
        />
      </div>

      {(data.blocks ?? []).length > 0 && (
        <div>
          <label style={labelStyle}>Blocks</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(data.blocks ?? []).map((block, bi) => (
              <div key={block.id || bi} style={{ padding: 12, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                  <input
                    placeholder="Block ID"
                    value={block.id}
                    onChange={(e) => updateBlock(bi, { id: e.target.value })}
                    style={{ ...inputStyle, fontFamily: 'monospace' }}
                  />
                  <input
                    placeholder="Block label"
                    value={block.label}
                    onChange={(e) => updateBlock(bi, { label: e.target.value })}
                    style={inputStyle}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="number"
                      min={0}
                      placeholder="min"
                      value={block.selection?.min ?? 1}
                      onChange={(e) => updateBlock(bi, { selection: { ...block.selection, min: parseInt(e.target.value, 10) || 0 } })}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="max"
                      value={block.selection?.max ?? 1}
                      onChange={(e) => updateBlock(bi, { selection: { ...block.selection, max: parseInt(e.target.value, 10) || 0 } })}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  </div>
                  <input
                    placeholder="match_mode"
                    value={block.match_mode ?? ''}
                    onChange={(e) => updateBlock(bi, { match_mode: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Criteria</div>
                {(block.criteria ?? []).map((crit, ci) => (
                  <div key={crit.id || ci} style={{ marginBottom: 8, padding: 8, background: 'var(--bg)', borderRadius: 4 }}>
                    <input
                      placeholder="Criterion ID"
                      value={crit.id}
                      onChange={(e) => updateCriterion(bi, ci, { id: e.target.value })}
                      style={{ ...inputStyle, marginBottom: 4, fontFamily: 'monospace' }}
                    />
                    <input
                      placeholder="Keywords (comma-separated)"
                      value={Array.isArray(crit.keywords) ? crit.keywords.join(', ') : ''}
                      onChange={(e) =>
                        updateCriterion(bi, ci, {
                          keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        })
                      }
                      style={{ ...inputStyle, marginBottom: 4 }}
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      placeholder="score"
                      value={crit.score ?? 0}
                      onChange={(e) => updateCriterion(bi, ci, { score: parseFloat(e.target.value) || 0 })}
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {isChoiceType && (
        <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <label style={labelStyle}>Answer key (choice/MCQ)</label>
          <input
            placeholder="Correct option (e.g. a, b, c)"
            value={data.answer_key?.correct_option ?? ''}
            onChange={(e) => update({ answer_key: { ...data.answer_key, correct_option: e.target.value } })}
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <textarea
            placeholder="Logic explanation"
            value={data.answer_key?.logic_explanation ?? ''}
            onChange={(e) => update({ answer_key: { ...data.answer_key, logic_explanation: e.target.value } })}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
      )}

      {(data.penalties !== undefined || data.scoring_rules !== undefined) && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Penalties and scoring_rules are preserved; edit in JSON if needed.
        </div>
      )}
    </div>
  );
}
