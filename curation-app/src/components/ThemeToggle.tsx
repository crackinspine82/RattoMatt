import { useTheme } from '../contexts/ThemeContext';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 9999,
        padding: '8px 12px',
        fontSize: 13,
        fontWeight: 500,
        border: '1px solid var(--border)',
        borderRadius: 6,
        background: 'var(--surface)',
        color: 'var(--text)',
        cursor: 'pointer',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {theme === 'light' ? 'Dark' : 'Light'}
    </button>
  );
}
