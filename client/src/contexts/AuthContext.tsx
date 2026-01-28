import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(async ({ data: { session } }: { data: { session: Session | null } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      await checkUserRole(session?.user);
      setLoading(false);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event: string, session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);
      await checkUserRole(session?.user);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserRole = async (user: User | null | undefined) => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    
    // Check if user has admin role in public.profiles or similar
    // For now, we'll assume a simple metadata check or a specific email for simplicity
    // In a real app, you'd query a 'profiles' table.
    // Let's implement a basic check: if email contains 'admin', it's admin (for demo purposes)
    // OR query a profiles table if it exists.
    
    // FALLBACK DE SEGURANÇA: Lista de emails que SEMPRE são admins
    // Isso garante acesso mesmo se o banco falhar
    const ADMIN_EMAILS = ['vitor@evolucaoimpressos.com.br', 'admin@evolucao.com', 'teste@teste.com'];
    
    if (user.email) {
      const userEmail = user.email.toLowerCase().trim();
      const adminEmailsLower = ADMIN_EMAILS.map(e => e.toLowerCase().trim());
      
      console.log('Checking admin access for:', userEmail);
      console.log('Allowed admins:', adminEmailsLower);

      if (adminEmailsLower.includes(userEmail)) {
        console.log('✅ User is admin (confirmed by EMAIL whitelist):', userEmail);
        setIsAdmin(true);
        return;
      }
    }

    try {
      console.log('Checking role in DB for user:', user.id);
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
        
      if (error) {
        console.error('Supabase DB Error:', error);
        // Se der erro 406 (Not Acceptable) ou tabela não existir,
        // ainda tentamos verificar se o email parece ser de admin como último recurso
        if (user.email?.includes('admin') || user.email?.includes('vitor')) {
           console.log('DB failed but email looks like admin, granting access as fallback');
           setIsAdmin(true);
           return;
        }
      }

      if (data && data.role === 'admin') {
        console.log('User is admin (confirmed by DB)');
        setIsAdmin(true);
      } else {
        console.log('User is NOT admin. DB Role:', data?.role);
        setIsAdmin(false);
      }
    } catch (e) {
      console.error('Error checking user role:', e);
      setIsAdmin(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
