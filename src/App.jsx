import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { APP_NAME, configMissing } from './lib/supabase';
import { Banner, FullScreenLoading } from './components/ui';
import AppShell from './components/AppShell';
import Login from './pages/Login';
import Home from './pages/Home';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Loans from './pages/Loans';
import LoanForm from './pages/LoanForm';
import LoanDetail from './pages/LoanDetail';
import Reminders from './pages/Reminders';
import Settings from './pages/Settings';

function SetupNeeded() {
  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="mb-3 text-3xl font-bold">{APP_NAME} needs setup</h1>
      <Banner type="error">
        The Supabase settings are missing. Add <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_ANON_KEY</b> (in <b>.env.local</b> on your computer, or in Vercel, Settings, Environment Variables), then restart or redeploy.
      </Banner>
    </div>
  );
}

function NoAccess() {
  const { session, adminError, signOut } = useAuth();
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-4 px-5">
      <h1 className="text-3xl font-bold">No access yet</h1>
      {adminError ? (
        <Banner type="error">The database could not be read: {adminError}. Check that schema.sql was run.</Banner>
      ) : (
        <Banner type="info">
          <b>{session?.user?.email}</b> can sign in but is not an active admin. Ask the Master Admin to add this email (seed_admins.sql) or re-activate it.
        </Banner>
      )}
      <button className="btn-ghost w-full" onClick={signOut}>Sign out</button>
    </div>
  );
}

function Protected({ children }) {
  const { session, admin, loading } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (!session) return <Navigate to="/login" replace />;
  if (!admin || !admin.is_active) return <NoAccess />;
  return children;
}

function MasterOnly({ children }) {
  const { isMaster } = useAuth();
  return isMaster ? children : <Navigate to="/" replace />;
}

export default function App() {
  if (configMissing) return <SetupNeeded />;
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><AppShell /></Protected>}>
        <Route index element={<Home />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="loans" element={<Loans />} />
        <Route path="loans/new" element={<LoanForm />} />
        <Route path="loans/:id" element={<LoanDetail />} />
        <Route path="reminders" element={<Reminders />} />
        <Route path="settings" element={<MasterOnly><Settings /></MasterOnly>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
