import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then((u) => setUser(u ? { ...u, name: u.full_name || u.name || '' } : u))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

    // Normalise: backend returns full_name (canonical) + name (alias); prefer full_name
    const normalise = (u) =>
      u ? { ...u, name: u.full_name || u.name || '' } : u;

  const login = async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.access_token);
    const me = await api.get('/auth/me');
    setUser(normalise(me));
    return normalise(me);
  };

  const register = async (name, email, password) => {
    await api.post('/auth/register', { name, full_name: name, email, password });
    return login(email, password);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
