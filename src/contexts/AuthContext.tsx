import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { APP_MODULE_KEYS, type AppModuleKey } from '@/constants/modules';
import { type HubRole } from '@/lib/hubRoles';
import { buildAuthorizationSnapshot } from '@/lib/authz';
import { clearAvatarPhotoCache, preloadAvatarPhoto } from '@/shared/users/avatarPhoto';
import { revokePushOnSignOut } from '@/modules/notifications/pushConsent';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  role: string | null;
  hubRole: HubRole | null;
  hubPermissions: ReturnType<typeof buildAuthorizationSnapshot>['permissions'];
  modules: AppModuleKey[];
  hasModuleAccess: (moduleKey: AppModuleKey) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  role: null,
  hubRole: null,
  hubPermissions: buildAuthorizationSnapshot(null).permissions,
  modules: [],
  hasModuleAccess: () => false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [modules, setModules] = useState<AppModuleKey[]>([]);

  useEffect(() => {
    // Start downloading the signed, private photo as soon as authentication is available.
    // Defer Supabase requests outside the auth callback to avoid auth-lock contention.
    const prefetchAvatar = (currentUser: User) => {
      window.setTimeout(() => {
        void preloadAvatarPhoto(currentUser.id).catch(() => { /* Initials remain available. */ });
      }, 0);
    };

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) prefetchAvatar(session.user);
      void loadUserData(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'SIGNED_OUT') {
        clearAvatarPhotoCache();
        // Also handles sign-out from another tab, where a server request may not be possible.
        void revokePushOnSignOut(null);
      }
      if (session?.user && (_event === 'SIGNED_IN' || _event === 'INITIAL_SESSION')) {
        prefetchAvatar(session.user);
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      void loadUserData(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserData = async (currentUser: User | null | undefined) => {
    if (!currentUser) {
      setIsAdmin(false);
      setRole(null);
      setModules([]);
      return;
    }

    try {
      const [{ data: profileData }, { data: moduleData }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', currentUser.id).single(),
        supabase.from('user_module_access').select('module_key').eq('user_id', currentUser.id),
      ]);

      const rawRole = profileData?.role ?? null;
      const authorization = buildAuthorizationSnapshot(rawRole);
      setRole(rawRole);
      setIsAdmin(authorization.isAdmin);
      const nextModules = (moduleData || [])
        .map((entry) => entry.module_key)
        .filter((moduleKey): moduleKey is AppModuleKey =>
          (APP_MODULE_KEYS as readonly string[]).includes(moduleKey)
        );
      setModules(nextModules);
    } catch {
      setIsAdmin(false);
      setRole(null);
      setModules([]);
    }
  };

  const signOut = async () => {
    let token: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? null;
    } catch { /* Logout is still available without an active session. */ }
    await revokePushOnSignOut(token);
    await supabase.auth.signOut();
    clearAvatarPhotoCache();
  };

  const authorization = buildAuthorizationSnapshot(role);
  const hubPermissions = authorization.permissions;

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
        modules,
        hasModuleAccess: (moduleKey) => modules.includes(moduleKey),
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
