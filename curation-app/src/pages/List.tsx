import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listItems, logout, type CurationItem } from '../api';

/** Group items by subject, then by chapter (sorted by sequence). */
function groupBySubjectThenChapter(items: CurationItem[]): Array<{ subjectName: string; chapters: Array<{ label: string; seq: number; list: CurationItem[] }> }> {
  const bySubject: Record<string, Record<string, CurationItem[]>> = {};
  for (const it of items) {
    const sub = it.subject_name;
    if (!bySubject[sub]) bySubject[sub] = {};
    const chKey = `Ch${it.chapter_sequence_number} ${it.chapter_title}`;
    if (!bySubject[sub][chKey]) bySubject[sub][chKey] = [];
    bySubject[sub][chKey].push(it);
  }
  const subjectNames = Object.keys(bySubject).sort();
  return subjectNames.map((subjectName) => {
    const chapterEntries = Object.entries(bySubject[subjectName]);
    const chapters = chapterEntries
      .map(([label, list]) => ({
        label,
        seq: list[0]?.chapter_sequence_number ?? 0,
        list,
      }))
      .sort((a, b) => a.seq - b.seq);
    return { subjectName, chapters };
  });
}

export default function List() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CurationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('');
  const [gradeFilter, setGradeFilter] = useState<string>('');

  useEffect(() => {
    listItems()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const filteredItems = useMemo(() => {
    if (!gradeFilter) return items;
    return items.filter((i) => String(i.grade_level) === gradeFilter);
  }, [items, gradeFilter]);

  const grades = useMemo(() => {
    const set = new Set(items.map((i) => i.grade_level));
    return Array.from(set).sort((a, b) => a - b);
  }, [items]);

  const subjects = useMemo(() => {
    const set = new Set(filteredItems.map((i) => i.subject_name));
    return Array.from(set).sort();
  }, [filteredItems]);

  const bySubjectThenChapter = useMemo(() => groupBySubjectThenChapter(filteredItems), [filteredItems]);

  const filteredSections = subjectFilter
    ? bySubjectThenChapter.filter((s) => s.subjectName === subjectFilter)
    : bySubjectThenChapter;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, color: 'var(--text)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Curation items</h1>
        <button type="button" onClick={handleLogout} style={{ padding: '8px 16px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
          Log out
        </button>
      </header>
      {error && <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No curation items. Run <code>npm run curation:import</code> in the backend.</p>
      ) : (
        <>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label htmlFor="grade-filter" style={{ fontSize: 14, fontWeight: 600 }}>
              Grade
            </label>
            <select
              id="grade-filter"
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              style={{ padding: '8px 12px', fontSize: 14, minWidth: 120, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            >
              <option value="">All grades</option>
              {grades.map((g) => (
                <option key={g} value={String(g)}>
                  {g}
                </option>
              ))}
            </select>
            <label htmlFor="subject-filter" style={{ fontSize: 14, fontWeight: 600 }}>
              Subject
            </label>
            <select
              id="subject-filter"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              style={{ padding: '8px 12px', fontSize: 14, minWidth: 200, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            >
              <option value="">All subjects</option>
              {subjects.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {filteredSections.map(({ subjectName, chapters }) => (
              <li key={subjectName} style={{ marginBottom: 24 }}>
                <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{subjectName}</h2>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {chapters.map(({ label, list }) => (
                    <li key={label} style={{ marginBottom: 12, background: 'var(--surface)', borderRadius: 8, padding: 16, boxShadow: 'var(--shadow)' }}>
                      <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>{label}</h3>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {list
                          .filter((it) => ['structure', 'questions', 'revision_notes'].includes(it.content_type))
                          .map((it) => {
                          const to =
                            it.content_type === 'structure'
                              ? `/item/${it.id}/structure`
                              : it.content_type === 'questions'
                                ? `/item/${it.id}/questions`
                                : `/item/${it.id}/revision-notes`;
                          const label =
                            it.content_type === 'structure'
                              ? 'Structure'
                              : it.content_type === 'questions'
                                ? 'Questions'
                                : 'Revision Notes';
                          return (
                            <li key={it.id}>
                              <Link
                                to={to}
                                style={{ display: 'inline-block', padding: '8px 14px', background: 'var(--bg)', borderRadius: 6, textDecoration: 'none', color: 'var(--link)', fontSize: 14, border: '1px solid var(--border)' }}
                              >
                                {label}
                              </Link>
                              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>{it.status}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
