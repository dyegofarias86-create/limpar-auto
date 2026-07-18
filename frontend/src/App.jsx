import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import Provisions from './pages/Provisions';
import Marketing from './pages/Marketing';
import Billing from './pages/Billing';
import Agenda from './pages/Agenda';
import Clients from './pages/Clients';
import Upload from './pages/Upload';
import Representatives from './pages/Representatives';
import OneDriveSync from './pages/OneDriveSync';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { user } = useAuth();
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="gastos" element={<Expenses />} />
            <Route path="provisoes" element={<Provisions />} />
            <Route path="marketing" element={<Marketing />} />
            <Route path="faturamento" element={<Billing />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="clientes" element={<Clients />} />
            <Route path="upload" element={<Upload />} />
            <Route path="representantes" element={<Representatives />} />
            <Route path="onedrive" element={<OneDriveSync />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
