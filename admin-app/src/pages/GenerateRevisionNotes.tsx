import { useEffect, useState } from 'react';
import { listPublishedChapters, enqueueJob } from '../api';

export default function GenerateRevisionNotes() {
  const [chapters, setChapters] = useState<Awaited<ReturnType<typeof listPublishedChapters>>>([]);
  const [chapterId, setChapterId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    listPublishedChapters()
      .then(setChapters)
      .catch(() => setChapters([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chapterId) return;
    setMessage('');
    setSubmitLoading(true);
    try {
      await enqueueJob('generate_revision_notes', { chapter_id: chapterId });
      setMessage('Job queued. Check Jobs for status.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to queue job');
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: 24 }}>Generate Revision Notes</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Requires structure to be published for the chapter. Runs study-notes-generate → merge node IDs → import revision notes.
      </p>
      <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
            Chapter (published only)
          </label>
          <select
            value={chapterId}
            onChange={(e) => setChapterId(e.target.value)}
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
            <option value="">Select a chapter</option>
            {chapters.map((c) => (
              <option key={c.chapter_id} value={c.chapter_id}>
                {c.subject_name} · Ch{c.chapter_sequence_number} {c.chapter_title}
                {c.discipline ? ` (${c.discipline})` : ''}
              </option>
            ))}
          </select>
        </div>
        {chapters.length === 0 && !loading && (
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
            No published chapters. Publish structure first from the curation app, then run Publish.
          </p>
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
          disabled={submitLoading || !chapterId || chapters.length === 0}
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
