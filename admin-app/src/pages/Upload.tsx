import { useState } from 'react';
import { enqueueJob } from '../api';

export default function Upload() {
  const [submitLoading, setSubmitLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setSubmitLoading(true);
    try {
      await enqueueJob('upload_chapter', {});
      setMessage('Job queued. Note: XLSX+ZIP ingest is not yet implemented; the job will fail with a message until backend supports it.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to queue job');
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: 24 }}>Upload Chapter</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Upload XLSX + ZIP for a chapter (validate → ingest). This path is for content that already has structure in XLSX form.
        File upload UI and validation/ingest implementation are coming soon.
      </p>
      <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
          Currently you can queue an upload job; the worker will report that XLSX+ZIP ingest is not implemented yet.
        </p>
        {message && (
          <p
            style={{
              marginBottom: 16,
              padding: 12,
              background: message.includes('not yet implemented') ? 'rgba(88, 166, 255, 0.15)' : 'rgba(248, 81, 73, 0.15)',
              color: message.includes('not yet implemented') ? 'var(--link)' : 'var(--danger)',
              borderRadius: 6,
              fontSize: 14,
            }}
          >
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={submitLoading}
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
          {submitLoading ? 'Queuing…' : 'Queue upload job (stub)'}
        </button>
      </form>
    </div>
  );
}
