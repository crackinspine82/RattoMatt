import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listJobs } from '../api';

export default function Dashboard() {
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof listJobs>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listJobs({ limit: 10 })
      .then(setJobs)
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  const running = jobs.filter((j) => j.status === 'running');
  const queued = jobs.filter((j) => j.status === 'queued');

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: 24 }}>Dashboard</h1>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 32 }}>
        <div
          style={{
            padding: 20,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            minWidth: 200,
          }}
        >
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>Running</div>
          <div style={{ fontSize: 28, fontWeight: 600 }}>{running.length}</div>
        </div>
        <div
          style={{
            padding: 20,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            minWidth: 200,
          }}
        >
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>Queued</div>
          <div style={{ fontSize: 28, fontWeight: 600 }}>{queued.length}</div>
        </div>
      </div>
      <section>
        <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>Recent jobs</h2>
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
        ) : jobs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No jobs yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {jobs.map((j) => (
              <li
                key={j.id}
                style={{
                  padding: '12px 16px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  marginBottom: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  <Link to={`/jobs/${j.id}`} style={{ fontWeight: 500 }}>
                    {j.job_type}
                  </Link>
                  <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                    {j.status}
                  </span>
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {new Date(j.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
        {jobs.length > 0 && (
          <p style={{ marginTop: 12 }}>
            <Link to="/jobs">View all jobs →</Link>
          </p>
        )}
      </section>
    </div>
  );
}
