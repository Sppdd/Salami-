import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { BusinessProvider } from './lib/business';
import { useSession } from './lib/hooks';
import { Appointments } from './pages/Appointments';
import { CallRoom } from './pages/CallRoom';
import { Calls } from './pages/Calls';
import { Dashboard } from './pages/Dashboard';
import { Insights } from './pages/Insights';
import { Login } from './pages/Login';
import { Settings } from './pages/Settings';

export function App() {
  const { session, loading } = useSession();
  if (loading) return <div className="grid min-h-screen place-items-center text-slate-400">Loading…</div>;
  if (!session) return <Login />;

  return (
    <BusinessProvider userId={session.user.id}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="appointments" element={<Appointments />} />
            <Route path="calls" element={<Calls />} />
            <Route path="calls/:id" element={<CallRoom />} />
            <Route path="insights" element={<Insights />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </BusinessProvider>
  );
}
