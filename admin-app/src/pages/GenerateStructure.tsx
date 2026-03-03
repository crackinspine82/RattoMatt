import { useEffect, useState } from 'react';
import { listBooks, listChapters, enqueueJob } from '../api';

export default function GenerateStructure() {
  const [books, setBooks] = useState<Awaited<ReturnType<typeof listBooks>>>([]);
  const [selectedBook, setSelectedBook] = useState('');
  const [chapters, setChapters] = useState<Awaited<ReturnType<typeof listChapters>>>([]);
  const [selectedChapters, setSelectedChapters] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    listBooks()
      .then(setBooks)
      .catch(() => setBooks([]));
  }, []);

  useEffect(() => {
    if (!selectedBook) {
      setChapters([]);
      setSelectedChapters([]);
      return;
    }
    setLoading(true);
    listChapters(selectedBook)
      .then((c) => {
        setChapters(c);
        setSelectedChapters(c.map((x) => x.sequence_number));
      })
      .catch(() => setChapters([]))
      .finally(() => setLoading(false));
  }, [selectedBook]);

  function toggleChapter(seq: number) {
    setSelectedChapters((prev) =>
      prev.includes(seq) ? prev.filter((n) => n !== seq) : [...prev, seq].sort((a, b) => a - b)
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBook) return;
    setMessage('');
    setSubmitLoading(true);
    try {
      const payload =
        selectedChapters.length === 0 || selectedChapters.length === chapters.length
          ? { book_slug: selectedBook }
          : { book_slug: selectedBook, chapter_numbers: selectedChapters };
      await enqueueJob('generate_structure', payload);
      setMessage('Job queued. Check Jobs for status.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to queue job');
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: 24 }}>Generate Structure</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Runs syllabus extract → study-notes extract → curation import. Result appears in curation app as Not Published.
      </p>
      <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
            Book
          </label>
          <select
            value={selectedBook}
            onChange={(e) => setSelectedBook(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          >
            <option value="">Select a book</option>
            {books.map((b) => (
              <option key={b.book_slug} value={b.book_slug}>
                {b.book_name} (Grade {b.grade}, {b.subject})
              </option>
            ))}
          </select>
        </div>
        {selectedBook && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>
              Chapters (default: all)
            </label>
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Loading chapters…</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {chapters.map((c) => (
                  <label
                    key={`${c.sequence_number}-${c.discipline ?? 'x'}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 10px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedChapters.includes(c.sequence_number)}
                      onChange={() => toggleChapter(c.sequence_number)}
                    />
                    <span style={{ fontSize: 14 }}>
                      Ch{c.sequence_number}
                      {c.discipline ? ` ${c.discipline}` : ''}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        {message && (
          <p
            style={{
              marginBottom: 16,
              padding: 12,
              background: message.startsWith('Job') ? 'rgba(63, 185, 80, 0.15)' : 'rgba(248, 81, 73, 0.15)',
              color: message.startsWith('Job') ? 'var(--success)' : 'var(--danger)',
              borderRadius: 6,
            }}
          >
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={submitLoading || !selectedBook}
          style={{
            padding: '10px 20px',
            fontSize: 16,
            fontWeight: 600,
            background: 'var(--link)',
            color: '#fff',
            border: 0,
            borderRadius: 6,
            cursor: submitLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {submitLoading ? 'Queuing…' : 'Queue job'}
        </button>
      </form>
    </div>
  );
}
