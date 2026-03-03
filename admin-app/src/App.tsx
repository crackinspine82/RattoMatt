import { Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import GenerateStructure from './pages/GenerateStructure';
import GenerateRevisionNotes from './pages/GenerateRevisionNotes';
import GenerateQuestionBank from './pages/GenerateQuestionBank';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import Upload from './pages/Upload';
import Publish from './pages/Publish';
import Placeholder from './pages/Placeholder';

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout>
              <Dashboard />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/generate/structure"
        element={
          <RequireAuth>
            <Layout>
              <GenerateStructure />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/generate/revision-notes"
        element={
          <RequireAuth>
            <Layout>
              <GenerateRevisionNotes />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/generate/question-bank"
        element={
          <RequireAuth>
            <Layout>
              <GenerateQuestionBank />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/jobs"
        element={
          <RequireAuth>
            <Layout>
              <Jobs />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/jobs/:id"
        element={
          <RequireAuth>
            <Layout>
              <JobDetail />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/upload"
        element={
          <RequireAuth>
            <Layout>
              <Upload />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/publish"
        element={
          <RequireAuth>
            <Layout>
              <Publish />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/paper-templates"
        element={
          <RequireAuth>
            <Layout>
              <Placeholder
                title="Paper Templates"
                recommendation="Create and manage paper templates by board, grade, subject, and duration. This will be added in a later version of the admin dashboard."
              />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/reports"
        element={
          <RequireAuth>
            <Layout>
              <Placeholder
                title="Review Reports"
                recommendation="Audit logs, subscription reports, and content review reports will be available here in a later version."
              />
            </Layout>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
