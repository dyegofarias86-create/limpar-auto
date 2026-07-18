import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('limpar_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('limpar_token');
      localStorage.removeItem('limpar_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('limpar_user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  async function login(email, password) {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('limpar_token', data.token);
      localStorage.setItem('limpar_user', JSON.stringify(data.user));
      setUser(data.user);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Erro ao fazer login' };
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem('limpar_token');
    localStorage.removeItem('limpar_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, api }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export { api };
