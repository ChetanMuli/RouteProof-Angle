import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { useLang } from './i18n.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const { setLang } = useLang();

  useEffect(() => {
    if (!localStorage.getItem('token')) { setReady(true); return; }
    api('/auth/me').then((r) => { setUser(r.user); setLang(r.user.language, false); }).catch(() => localStorage.removeItem('token')).finally(() => setReady(true));
  }, []); // eslint-disable-line

  const login = async (username, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { username, password } });
    localStorage.setItem('token', r.token);
    setUser(r.user); setLang(r.user.language, false);
    return r.user;
  };
  const logout = () => { localStorage.removeItem('token'); setUser(null); };
  const can = (perm) => !!user && (user.role === 'admin' || user.permissions.includes(perm));

  return <AuthCtx.Provider value={{ user, ready, login, logout, can }}>{children}</AuthCtx.Provider>;
}
