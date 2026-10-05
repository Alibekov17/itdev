import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { getInitData, getDevUser } from '../lib/telegram';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/auth/me', { method: 'POST' });
      setProfile(data.profile);
    } catch (e) {
      setProfile(null);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const hasCreds = Boolean(getInitData() || getDevUser());
    if (hasCreds) refresh();
    else setLoading(false);
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ profile, loading, error, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
