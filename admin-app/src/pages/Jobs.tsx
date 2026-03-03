import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listJobs, type AdminJob } from '../api';

function ProgressBar({ job }: { job: AdminJob }) {
  if (job.status !== 'running') return null;
  const pct = job.progress_pct ?? 0;
  const isIndeterminate = pct <= 0 && !job.progress_message;
  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          height: 8,
          background: 'var(--surface-hover)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: isIndeterminate ? '30%' : `${Math.min(100, Math.max(0, pct))}%`,
            background: 'var(--link)',
            borderRadius: 4,
            transition: 'width 0.3s ease',
            ...(isIndeterminate ? { animation: 'progress-indeterminate 1.5s ease-in-out infinite' } : {}),
          }}
        />
      </div>
      {(job.progress_message ?? (isIndeterminate ? 'Starting…' : null)) && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{job.progress_message || 'Starting…'}</div>
      )}
      {job.estimated_finished_at && job.status === 'running' && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          Estimated: ~{Math.max(0, Math.ceil((new Date(job.estimated_finished_at).getTime() - Date.now()) / 60000))} min left
        </div>
      )}
    </div>
  );
}

export default function Jobs() {
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const hasRunning = jobs.some((j) => j.status === 'running');
  const pollInterval = hasRunning ? 2000 : 5000;

  function load(isBackgroundRefresh = false) {
    if (!isBackgroundRefresh) setLoading(true);
    listJobs({
      status: statusFilter && ['queued', 'running', 'completed', 'failed'].includes(statusFilter)
        ? (statusFilter as AdminJob['status'])
        : undefined,
      limit: 100,
    })
      .then(setJobs)
      .catch(() => setJobs([]))
      .finally(() => {
        if (!isBackgroundRefresh) setLoading(false);
      });
  }

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), pollInterval);
    return () => clearInterval(t);
  }, [statusFilter, pollInterval]);

  return (
    <div>
      <style>{`
        @keyframes progress-indeterminate {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
      <h1 style={{ margin: '0 0 24px', fontSize: 24 }}>Jobs</h1>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ fontSize: 14, color: 'var(--text-muted)' }}>Status:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--surface)',
            color: 'var(--text)',
          }}
        >
          <option value="">All</option>
          <option value="queued">Queued</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : jobs.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No jobs.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {jobs.map((j) => (
            <Link
              key={j.id}
              to={`/jobs/${j.id}`}
              style={{
                display: 'block',
                padding: '16px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                textDecoration: 'none',
                color: 'var(--text)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontWeight: 500 }}>{j.job_type}</span>
                <span
                  style={{
                    fontSize: 13,
                    padding: '4px 8px',
                    borderRadius: 4,
                    background:
                      j.status === 'completed'
                        ? 'rgba(63, 185, 80, 0.2)'
                        : j.status === 'failed'
                          ? 'rgba(248, 81, 73, 0.2)'
                          : j.status === 'running'
                            ? 'rgba(88, 166, 255, 0.2)'
                            : 'var(--surface-hover)',
                    color:
                      j.status === 'completed'
                        ? 'var(--success)'
                        : j.status === 'failed'
                          ? 'var(--danger)'
                          : 'var(--text)',
                  }}
                >
                  {j.status}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                {new Date(j.created_at).toLocaleString()}
                {j.finished_at && ` · Finished ${new Date(j.finished_at).toLocaleString()}`}
              </div>
              <ProgressBar job={j} />
              {j.error_message && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--danger)' }}>
                  {j.error_message}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
