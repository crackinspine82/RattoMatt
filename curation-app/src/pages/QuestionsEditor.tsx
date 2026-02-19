import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItem, getQuestions, saveQuestions, setStatus, setQuestionReady, type CurationItem, type DraftQuestion } from '../api';
import { RubricForm } from '../components/RubricForm';
import { RichTextField } from '../components/RichTextEditor';
import {
  QUESTION_TYPE_ORDER,
  QUESTION_TYPE_CATEGORY,
  questionTypeToLabel,
} from '../constants/questionTypes';

const LEFT_WIDTH_KEY = 'curation-questions-left-width';
const RIGHT_WIDTH_KEY = 'curation-questions-right-width';
const MIN_LEFT = 200;
const MIN_RIGHT = 280;
const DEFAULT_LEFT = 280;
const DEFAULT_RIGHT = 320;
const UNDO_MAX = 5;

type UndoSnapshot = { questions: DraftQuestion[]; selectedId: string | null };

function getStoredWidth(key: string, min: number, max: number, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const stored = localStorage.getItem(key);
  const n = stored ? parseInt(stored, 10) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

type TypeGroup = { typeId: string; label: string; questions: DraftQuestion[] };
type CategoryGroup = { category: string; types: TypeGroup[] };

function groupQuestionsByCategory(questions: DraftQuestion[]): CategoryGroup[] {
  const byType = new Map<string, DraftQuestion[]>();
  for (const q of questions) {
    const t = q.question_type || 'other';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(q);
  }
  const categoryOrder: Array<'MCQs' | 'Short answer' | 'Longer'> = ['MCQs', 'Short answer', 'Longer'];
  const result: CategoryGroup[] = [];
  for (const cat of categoryOrder) {
    const types: TypeGroup[] = [];
    for (const typeId of QUESTION_TYPE_ORDER) {
      if (QUESTION_TYPE_CATEGORY[typeId] !== cat) continue;
      const list = byType.get(typeId);
      if (list?.length) types.push({ typeId, label: questionTypeToLabel(typeId), questions: list });
    }
    if (types.length > 0) result.push({ category: cat, types });
  }
  for (const [typeId, list] of byType) {
    if (!QUESTION_TYPE_ORDER.includes(typeId)) {
      const cat = QUESTION_TYPE_CATEGORY[typeId] ?? 'Longer';
      let entry = result.find((r) => r.category === cat);
      if (!entry) {
        entry = { category: cat, types: [] };
        result.push(entry);
      }
      entry.types.push({ typeId, label: questionTypeToLabel(typeId), questions: list });
    }
  }
  return result;
}

export default function QuestionsEditor() {
  const { itemId } = useParams<{ itemId: string }>();
  const [item, setItem] = useState<CurationItem | null>(null);
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedInProgress, setCollapsedInProgress] = useState(true);
  const [collapsedReady, setCollapsedReady] = useState(true);
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(
    () => new Set(QUESTION_TYPE_ORDER.flatMap((t) => [`inProgress-${t}`, `ready-${t}`]))
  );
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const questionsRef = useRef<DraftQuestion[]>([]);

  const [leftWidth, setLeftWidth] = useState(() => getStoredWidth(LEFT_WIDTH_KEY, MIN_LEFT, 600, DEFAULT_LEFT));
  const [rightWidth, setRightWidth] = useState(() => getStoredWidth(RIGHT_WIDTH_KEY, MIN_RIGHT, 800, DEFAULT_RIGHT));
  const leftWidthRef = useRef(leftWidth);
  const rightWidthRef = useRef(rightWidth);

  useEffect(() => {
    if (!itemId) return;
    Promise.all([getItem(itemId), getQuestions(itemId)])
      .then(([i, data]) => {
        setItem(i);
        const qs = (data.questions || []).map((q) => ({ ...q, ready_to_publish: q.ready_to_publish ?? false }));
        setQuestions(qs);
        setSelectedId(qs.length > 0 ? qs[0].id : null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [itemId]);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  function pushUndo(snapshot?: UndoSnapshot) {
    const toPush: UndoSnapshot = snapshot ?? { questions: [...questionsRef.current], selectedId };
    setUndoStack((prev) => {
      const next = prev.length >= UNDO_MAX ? prev.slice(1) : prev;
      return [...next, toPush];
    });
  }

  function handleUndo() {
    const snapshot = undoStack[undoStack.length - 1];
    if (!snapshot) return;
    setQuestions(snapshot.questions);
    setSelectedId(snapshot.selectedId);
    setUndoStack((prev) => prev.slice(0, -1));
  }

  function handleDeleteClick() {
    if (!selectedQuestion) return;
    setShowDeleteConfirm(true);
  }

  function handleDeleteConfirm() {
    if (!selectedQuestion) return;
    pushUndo();
    const idToRemove = selectedQuestion.id;
    const next = questions.filter((q) => q.id !== idToRemove);
    setQuestions(next);
    const idx = questions.findIndex((q) => q.id === idToRemove);
    const nextSelected = next[idx] ?? next[idx - 1] ?? next[0];
    setSelectedId(nextSelected ? nextSelected.id : null);
    setShowDeleteConfirm(false);
  }

  const inProgressQuestions = useMemo(() => questions.filter((q) => !(q.ready_to_publish ?? false)), [questions]);
  const readyToPublishQuestions = useMemo(() => questions.filter((q) => q.ready_to_publish === true), [questions]);
  const inProgressGrouped = useMemo(() => groupQuestionsByCategory(inProgressQuestions), [inProgressQuestions]);
  const readyGrouped = useMemo(() => groupQuestionsByCategory(readyToPublishQuestions), [readyToPublishQuestions]);

  function toggleTypeCollapsed(bucket: 'inProgress' | 'ready', typeId: string) {
    const key = `${bucket}-${typeId}`;
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const selectedQuestion = useMemo(() => questions.find((q) => q.id === selectedId) ?? null, [questions, selectedId]);

  function handleResizeLeftStart(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftWidth;
    leftWidthRef.current = startW;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;
      const next = Math.min(600, Math.max(MIN_LEFT, startW + delta));
      leftWidthRef.current = next;
      setLeftWidth(next);
    }
    function onUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      localStorage.setItem(LEFT_WIDTH_KEY, String(leftWidthRef.current));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function handleResizeRightStart(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightWidth;
    rightWidthRef.current = startW;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;
      const next = Math.min(800, Math.max(MIN_RIGHT, startW + delta));
      rightWidthRef.current = next;
      setRightWidth(next);
    }
    function onUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      localStorage.setItem(RIGHT_WIDTH_KEY, String(rightWidthRef.current));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function updateQuestion(id: string, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  function handleRubricChange(id: string, rubricJson: Record<string, unknown>) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        const rubric = { ...q.rubric, rubric_json: rubricJson };
        const qType = typeof rubricJson.question_type === 'string' ? rubricJson.question_type : q.question_type;
        const dLevel = typeof rubricJson.difficulty_level === 'number' ? rubricJson.difficulty_level : q.difficulty_level;
        const aInput = typeof rubricJson.answer_input_type === 'string' ? rubricJson.answer_input_type : q.answer_input_type;
        const marks = typeof rubricJson.total_marks === 'number' ? rubricJson.total_marks : q.marks;
        return { ...q, question_type: qType, difficulty_level: dLevel, answer_input_type: aInput, marks, rubric };
      })
    );
  }

  async function handleToggleReady(questionId: string, ready: boolean) {
    if (!itemId) return;
    setError('');
    try {
      await setQuestionReady(itemId, questionId, ready);
      setQuestions((prev) => prev.map((q) => (q.id === questionId ? { ...q, ready_to_publish: ready } : q)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    }
  }

  async function handleSave() {
    if (!itemId) return;
    setSaving(true);
    setError('');
    try {
      const payload = questions.map((q) => ({
        id: q.id,
        draft_syllabus_node_id: q.draft_syllabus_node_id,
        question_text: q.question_text,
        question_type: q.question_type,
        discipline: q.discipline,
        difficulty_level: q.difficulty_level,
        answer_input_type: q.answer_input_type,
        marks: q.marks,
        source_type: q.source_type,
        model_answer_text: q.model_answer_text ?? '',
        ready_to_publish: q.ready_to_publish ?? false,
        rubric: { rubric_version: q.rubric.rubric_version, rubric_json: q.rubric.rubric_json },
      }));
      const data = await saveQuestions(itemId, payload);
      setQuestions(data.questions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleReadyToPublish() {
    if (!itemId) return;
    setError('');
    try {
      await setStatus(itemId, 'ready_to_publish');
      if (item) setItem({ ...item, status: 'ready_to_publish' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set status');
    }
  }

  if (!itemId) {
    return (
      <div style={{ padding: 24 }}>
        <Link to="/">Back to list</Link>
        <p>Missing item id.</p>
      </div>
    );
  }

  const title = item ? `Ch${item.chapter_sequence_number} ${item.chapter_title} – Questions` : 'Questions';

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', color: 'var(--text)' }}>
      <header style={{ flexShrink: 0, padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--header-bg)' }}>
        <Link to="/" style={{ color: 'var(--link)', textDecoration: 'none', fontSize: 14 }}>← Back to list</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
          {item && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.status}</span>}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title="Undo last action (up to 5)"
              style={{ padding: '10px 16px', fontSize: 14, fontWeight: 600, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, cursor: undoStack.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              Undo {undoStack.length > 0 && `(${undoStack.length})`}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, background: '#2563eb', color: '#fff', border: 0, borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {item?.status !== 'published' && (
              <button
                type="button"
                onClick={handleReadyToPublish}
                style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, background: '#16a34a', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer' }}
              >
                Ready to Publish
              </button>
            )}
          </div>
        </div>
      </header>
      {error && <p style={{ color: 'var(--danger)', margin: '0 24px 16px', fontSize: 14 }}>{error}</p>}

      {questions.length === 0 ? (
        <p style={{ padding: 24, color: 'var(--text-muted)' }}>No questions. Run curation import with question JSON for this chapter.</p>
      ) : (
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left sidebar: questions by type */}
          <div
            style={{
              width: leftWidth,
              flexShrink: 0,
              overflowY: 'auto',
              borderRight: '1px solid var(--border)',
              background: 'var(--surface)',
            }}
          >
            <div style={{ padding: 12 }}>
              <div style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setCollapsedInProgress((c) => !c)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    border: 'none',
                    background: 'var(--bg)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 13,
                    color: 'var(--text)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ flex: 1 }}>In Progress</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{inProgressQuestions.length}</span>
                  <span>{collapsedInProgress ? '▶' : '▼'}</span>
                </button>
                {!collapsedInProgress && (
                  <div style={{ marginTop: 4, marginLeft: 4 }}>
                    {inProgressGrouped.map(({ category, types }) => (
                      <div key={category} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                          {category}
                        </div>
                        {types.map(({ typeId, label, questions: typeQuestions }) => {
                          const collapseKey = `inProgress-${typeId}`;
                          const collapsed = collapsedTypes.has(collapseKey);
                          return (
                            <div key={typeId} style={{ marginBottom: 6 }}>
                              <button
                                type="button"
                                onClick={() => toggleTypeCollapsed('inProgress', typeId)}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  background: 'var(--bg)',
                                  color: 'var(--text)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span>{collapsed ? '▶' : '▼'}</span>
                                <span style={{ flex: 1 }}>{label}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{typeQuestions.length}</span>
                              </button>
                              {!collapsed && (
                                <div style={{ marginLeft: 12, marginTop: 2 }}>
                                  {typeQuestions.map((q) => {
                                    const tag = (q.rubric?.rubric_json && typeof q.rubric.rubric_json === 'object' && 'difficulty_tag' in q.rubric.rubric_json && typeof (q.rubric.rubric_json as { difficulty_tag?: string }).difficulty_tag === 'string')
                                      ? (q.rubric.rubric_json as { difficulty_tag: string }).difficulty_tag
                                      : 'easy';
                                    const isSelected = selectedId === q.id;
                                    return (
                                      <button
                                        key={q.id}
                                        type="button"
                                        onClick={() => setSelectedId(q.id)}
                                        style={{
                                          width: '100%',
                                          textAlign: 'left',
                                          padding: '4px 8px',
                                          border: 'none',
                                          borderRadius: 4,
                                          cursor: 'pointer',
                                          fontSize: 12,
                                          background: isSelected ? 'var(--focus-ring)' : 'transparent',
                                          color: 'var(--text)',
                                        }}
                                      >
                                        {q.question_text.replace(/<[^>]+>/g, ' ').trim().slice(0, 36) || 'Q'}… ({tag})
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {inProgressGrouped.length === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No questions in progress</p>
                    )}
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setCollapsedReady((c) => !c)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    border: 'none',
                    background: 'var(--bg)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 13,
                    color: 'var(--text)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ flex: 1 }}>Ready to Publish</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{readyToPublishQuestions.length}</span>
                  <span>{collapsedReady ? '▶' : '▼'}</span>
                </button>
                {!collapsedReady && (
                  <div style={{ marginTop: 4, marginLeft: 4 }}>
                    {readyGrouped.map(({ category, types }) => (
                      <div key={category} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                          {category}
                        </div>
                        {types.map(({ typeId, label, questions: typeQuestions }) => {
                          const collapseKey = `ready-${typeId}`;
                          const collapsed = collapsedTypes.has(collapseKey);
                          return (
                            <div key={typeId} style={{ marginBottom: 6 }}>
                              <button
                                type="button"
                                onClick={() => toggleTypeCollapsed('ready', typeId)}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  background: 'var(--bg)',
                                  color: 'var(--text)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span>{collapsed ? '▶' : '▼'}</span>
                                <span style={{ flex: 1 }}>{label}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{typeQuestions.length}</span>
                              </button>
                              {!collapsed && (
                                <div style={{ marginLeft: 12, marginTop: 2 }}>
                                  {typeQuestions.map((q) => {
                                    const tag = (q.rubric?.rubric_json && typeof q.rubric.rubric_json === 'object' && 'difficulty_tag' in q.rubric.rubric_json && typeof (q.rubric.rubric_json as { difficulty_tag?: string }).difficulty_tag === 'string')
                                      ? (q.rubric.rubric_json as { difficulty_tag: string }).difficulty_tag
                                      : 'easy';
                                    const isSelected = selectedId === q.id;
                                    return (
                                      <button
                                        key={q.id}
                                        type="button"
                                        onClick={() => setSelectedId(q.id)}
                                        style={{
                                          width: '100%',
                                          textAlign: 'left',
                                          padding: '4px 8px',
                                          border: 'none',
                                          borderRadius: 4,
                                          cursor: 'pointer',
                                          fontSize: 12,
                                          background: isSelected ? 'var(--focus-ring)' : 'transparent',
                                          color: 'var(--text)',
                                        }}
                                      >
                                        {q.question_text.replace(/<[^>]+>/g, ' ').trim().slice(0, 36) || 'Q'}… ({tag})
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {readyGrouped.length === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No questions ready</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div role="separator" aria-label="Resize left panel" onMouseDown={handleResizeLeftStart} style={{ width: 6, flexShrink: 0, cursor: 'col-resize', background: 'var(--border)' }} />

          {/* Center: question text + model answer */}
          <div style={{ flex: 1, minWidth: 200, overflowY: 'auto', padding: 24, background: 'var(--bg)' }}>
            {selectedQuestion ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {selectedQuestion.ready_to_publish ? (
                    <button
                      type="button"
                      onClick={() => handleToggleReady(selectedQuestion.id, false)}
                      style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}
                    >
                      Mark in progress
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleReady(selectedQuestion.id, true)}
                      style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, background: '#16a34a', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer' }}
                    >
                      Mark ready to publish
                    </button>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {selectedQuestion.ready_to_publish ? 'In Ready to Publish bucket' : 'In In Progress bucket'}
                  </span>
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 6, cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                </div>
                {showDeleteConfirm && (
                  <div
                    style={{
                      position: 'fixed',
                      inset: 0,
                      background: 'rgba(0,0,0,0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1000,
                    }}
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    <div
                      style={{
                        background: 'var(--surface)',
                        padding: 24,
                        borderRadius: 8,
                        boxShadow: 'var(--shadow)',
                        maxWidth: 400,
                        border: '1px solid var(--border)',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p style={{ margin: '0 0 16px', fontWeight: 600 }}>Remove this question from curation?</p>
                      <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-muted)' }}>
                        The question will be removed from the list. Click Save to persist changes (or Undo to restore).
                      </p>
                      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(false)}
                          style={{ padding: '8px 16px', fontSize: 14, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteConfirm}
                          style={{ padding: '8px 16px', fontSize: 14, fontWeight: 600, background: 'var(--danger)', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Question text</label>
                  <RichTextField
                    key={`${selectedQuestion.id}-question`}
                    editorKey={`${selectedQuestion.id}-question`}
                    value={selectedQuestion.question_text}
                    onChange={(html) => updateQuestion(selectedQuestion.id, { question_text: html })}
                    itemId={itemId ?? undefined}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Model answer</label>
                  <RichTextField
                    key={`${selectedQuestion.id}-model`}
                    editorKey={`${selectedQuestion.id}-model`}
                    value={selectedQuestion.model_answer_text ?? ''}
                    onChange={(html) => updateQuestion(selectedQuestion.id, { model_answer_text: html || null })}
                    itemId={itemId ?? undefined}
                  />
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>Select a question from the list.</p>
            )}
          </div>

          <div role="separator" aria-label="Resize right panel" onMouseDown={handleResizeRightStart} style={{ width: 6, flexShrink: 0, cursor: 'col-resize', background: 'var(--border)' }} />

          {/* Right: rubric form */}
          <div
            style={{
              width: rightWidth,
              flexShrink: 0,
              overflowY: 'auto',
              borderLeft: '1px solid var(--border)',
              background: 'var(--surface)',
            }}
          >
            {selectedQuestion ? (
              <RubricForm
                rubric={selectedQuestion.rubric.rubric_json as Record<string, unknown>}
                onChange={(rubricJson) => handleRubricChange(selectedQuestion.id, rubricJson)}
              />
            ) : (
              <p style={{ padding: 24, color: 'var(--text-muted)' }}>Select a question to view rubric.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
