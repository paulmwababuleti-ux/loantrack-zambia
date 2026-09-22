import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [admin, setAdmin] = useState(null);      // this person's row in the admins table
  const [adminError, setAdminError] = useState('');
  const [loading, setLoading] = useState(true);
  const loadedFor = useRef(null);                // user id whose admin row is already loaded

  async function loadAdmin(user) {
    if (!user) {
      loadedFor.current = null;
      setAdmin(null);
      setAdminError('');
      return;
    }
    const { data, error } = await supabase.from('admins').select('*').eq('id', user.id).maybeSingle();
    loadedFor.current = user.id;
    setAdmin(data);
    setAdminError(error ? error.message : '');
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadAdmin(data.session?.user);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      const user = s?.user;
      // Ignore hourly token refreshes for the same person; only react to a real sign-in or sign-out.
      if (user && user.id === loadedFor.current) return;
      if (user) setLoading(true);
      // Do not await Supabase calls inside this callback; defer them.
      setTimeout(async () => {
        await loadAdmin(user);
        setLoading(false);
      }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = {
    session,
    admin,
    adminError,
    loading,
    isMaster: !!admin && admin.is_active && admin.role === 'master_admin',
    roleLabel: admin?.role === 'master_admin' ? 'Master Admin' : 'Loan Officer',
    signOut: () => supabase.auth.signOut(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
