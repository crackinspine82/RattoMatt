import { Link, useLocation, useNavigate } from 'react-router-dom';

const NAV = [
  { path: '/', label: 'Dashboard' },
  { path: '/generate/structure', label: 'Generate Structure' },
  { path: '/generate/revision-notes', label: 'Generate Revision Notes' },
  { path: '/generate/question-bank', label: 'Generate Question Bank' },
  { path: '/jobs', label: 'Jobs' },
  { path: '/upload', label: 'Upload Chapter' },
  { path: '/publish', label: 'Publish' },
  { path: '/paper-templates', label: 'Paper Templates', placeholder: true },
  { path: '/reports', label: 'Reports', placeholder: true },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  function handleLogout() {
    localStorage.removeItem('admin_token');
    navigate('/login', { replace: true });
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 'var(--sidebar-width)',
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          padding: '20px 0',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '0 16px 16px', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>RattoMatt Admin</h1>
        </div>
        <nav>
          {NAV.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'block',
                  padding: '10px 20px',
                  color: isActive ? 'var(--link)' : 'var(--text)',
                  background: isActive ? 'var(--surface-hover)' : 'transparent',
                  borderLeft: isActive ? '3px solid var(--link)' : '3px solid transparent',
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                {item.label}
                {item.placeholder && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)' }}>Soon</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', marginTop: 12 }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: '8px 12px',
              fontSize: 14,
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Log out
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>{children}</main>
    </div>
  );
}
