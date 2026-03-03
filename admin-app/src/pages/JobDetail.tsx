import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getJob, type AdminJob } from '../api';

function JobProgressBlock({ job }: { job: AdminJob }) {
  if (job.status !== 'running' && job.status !== 'queued') return null;
  const pct = job.progress_pct ?? 0;
  const isIndeterminate = pct <= 0 && !job.progress_message;
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Progress</h2>
      <div
        style={{
          height: 12,
          background: 'var(--surface-hover)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: isIndeterminate ? '30%' : `${Math.min(100, Math.max(0, pct))}%`,
            background: 'var(--link)',
            borderRadius: 6,
            transition: 'width 0.3s ease',
            ...(isIndeterminate ? { animation: 'job-detail-indeterminate 1.5s ease-in-out infinite' } : {}),
          }}
        />
      </div>
      {(job.progress_message ?? (isIndeterminate ? 'Starting…' : null)) && (
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '8px 0 0' }}>{job.progress_message || 'Starting…'}</p>
      )}
      {job.estimated_finished_at && job.status === 'running' && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Estimated: ~{Math.max(0, Math.ceil((new Date(job.estimated_finished_at).getTime() - Date.now()) / 60000))} min left
          {' · '}
          Completion ~{new Date(job.estimated_finished_at).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<AdminJob | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getJob(id)
      .then(setJob)
      .catch(() => setJob(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || !job) return;
    if (job.status === 'running' || job.status === 'queued') {
      const t = setInterval(() => {
        getJob(id).then(setJob);
      }, 1500);
      return () => clearInterval(t);
    }
  }, [id, job?.status]);

  if (!id) return <p>Missing job ID</p>;
  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>;
  if (!job) return <p style={{ color: 'var(--danger)' }}>Job not found</p>;

  return (
    <div>
      <style>{`
        @keyframes job-detail-indeterminate {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
      <p style={{ marginBottom: 16 }}>
        <Link to="/jobs" style={{ color: 'var(--link)' }}>← Jobs</Link>
      </p>
      <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>{job.job_type}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        {job.status} · Created {new Date(job.created_at).toLocaleString()}
        {job.finished_at && ` · Finished ${new Date(job.finished_at).toLocaleString()}`}
      </p>
      <JobProgressBlock job={job} />
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Payload</h2>
        <pre
          style={{
            padding: 12,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'auto',
            fontSize: 13,
          }}
        >
          {JSON.stringify(job.payload, null, 2)}
        </pre>
      </div>
      {job.error_message && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 8px', color: 'var(--danger)' }}>Error</h2>
          <pre
            style={{
              padding: 12,
              background: 'rgba(248, 81, 73, 0.1)',
              border: '1px solid var(--danger)',
              borderRadius: 6,
              overflow: 'auto',
              fontSize: 13,
              whiteSpace: 'pre-wrap',
            }}
          >
            {job.error_message}
          </pre>
        </div>
      )}
      {job.log_output && (
        <div>
          <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Log</h2>
          <pre
            style={{
              padding: 12,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              overflow: 'auto',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              maxHeight: 400,
            }}
          >
            {job.log_output}
          </pre>
        </div>
      )}
      {job.result && Object.keys(job.result).length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Result</h2>
          <pre
            style={{
              padding: 12,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              overflow: 'auto',
              fontSize: 13,
            }}
          >
            {JSON.stringify(job.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
