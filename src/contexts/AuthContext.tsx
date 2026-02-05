import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getHubPermissions, normalizeRole, type HubRole } from '@/lib/hubRoles';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  role: string | null;
  hubRole: HubRole | null;
  hubPermissions: ReturnType<typeof getHubPermissions>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  role: null,
  hubRole: null,
  hubPermissions: getHubPermissions(null),
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      checkUserRole(session?.user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      checkUserRole(session?.user);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserRole = async (currentUser: User | null | undefined) => {
    if (!currentUser) {
      setIsAdmin(false);
      setRole(null);
      return;
    }

    try {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.id)
        .single();

      const rawRole = data?.role ?? null;
      const normalizedRole = normalizeRole(rawRole);
      setRole(rawRole);
      setIsAdmin(normalizedRole === 'gerente' || currentUser.email?.includes('admin') || false);
    } catch {
      setIsAdmin(false);
      setRole(null);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const hubPermissions = getHubPermissions(role);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAdmin,
        role,
        hubRole: hubPermissions.normalizedRole,
        hubPermissions,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
