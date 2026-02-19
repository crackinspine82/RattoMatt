import { Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated } from './api';
import { ThemeToggle } from './components/ThemeToggle';
import Login from './pages/Login';
import List from './pages/List';
import NotesEditor from './pages/NotesEditor';
import QuestionsEditor from './pages/QuestionsEditor';
import CombinedStructureEditor from './pages/CombinedStructureEditor';
import RevisionNotesEditor from './pages/RevisionNotesEditor';

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <ThemeToggle />
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <List />
          </RequireAuth>
        }
      />
      <Route
        path="/item/:itemId/structure"
        element={
          <RequireAuth>
            <CombinedStructureEditor />
          </RequireAuth>
        }
      />
      <Route
        path="/item/:itemId/revision-notes"
        element={
          <RequireAuth>
            <RevisionNotesEditor />
          </RequireAuth>
        }
      />
      <Route
        path="/item/:itemId/notes"
        element={
          <RequireAuth>
            <NotesEditor />
          </RequireAuth>
        }
      />
      <Route
        path="/item/:itemId/questions"
        element={
          <RequireAuth>
            <QuestionsEditor />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
