import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { useLocation } from 'wouter';
import { getCurrentUserDisplayName } from '@/shared/users/userDisplay';
import { signedAvatarUrl } from '@/shared/users/avatarPhoto';
import './welcome-transition.css';

// Allow users to read their name and see their photo, even on a fast connection.
export const MIN_WELCOME_DURATION_MS = 4000;

type WelcomeInfo = { userId: string; displayName: string };
type WelcomeContextValue = { beginWelcome: (user: User) => void };

const WelcomeContext = createContext<WelcomeContextValue>({ beginWelcome: () => {} });
export const useWelcomeTransition = () => useContext(WelcomeContext);

function WelcomeOverlay({ info, avatarUrl, exiting }: { info: WelcomeInfo; avatarUrl: string | null; exiting: boolean }) {
  const firstName = info.displayName.includes('@') ? 'usuário' : info.displayName.split(/\s+/)[0];
  const initial = firstName.charAt(0).toUpperCase() || 'U';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Preparando o EvoluSystem"
      className={`evolu-welcome ${exiting ? 'evolu-welcome--exit' : ''}`}
    >
      <div className="evolu-welcome__glow" aria-hidden="true" />
      <section className="evolu-welcome__content">
        <img className="evolu-welcome__brand" src="/evolusystem-logo-dark.svg" alt="EvoluSystem" />
        <div className="evolu-welcome__avatar">
          {avatarUrl
            ? <img src={avatarUrl} alt={`Foto de ${info.displayName}`} className="evolu-welcome__photo" />
            : <span aria-label={`Inicial de ${info.displayName}`}>{initial}</span>}
        </div>
        <h1 className="evolu-welcome__heading">Bem-vindo, {firstName}!</h1>
        <p className="evolu-welcome__subtitle">Carregando sistema...</p>
        <div className="evolu-welcome__track" aria-hidden="true"><span /></div>
      </section>
    </div>
  );
}

export function WelcomeTransitionProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [info, setInfo] = useState<WelcomeInfo | null>(null);
  const [exiting, setExiting] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarReady, setAvatarReady] = useState(false);
  const [minimumElapsed, setMinimumElapsed] = useState(false);

  const beginWelcome = (user: User) => {
    setAvatarReady(false);
    setMinimumElapsed(false);
    setAvatarUrl(null);
    setExiting(false);
    setInfo({ userId: user.id, displayName: getCurrentUserDisplayName(user) });
  };

  // Load the private user photo before ending the transition, with a short fallback.
  useEffect(() => {
    if (!info) return;
    let active = true;
    const fallbackTimer = window.setTimeout(() => { if (active) setAvatarReady(true); }, 1800);
    const load = async () => {
      try {
        const signedUrl = await signedAvatarUrl(info.userId);
        if (signedUrl) {
          const image = new Image();
          image.src = signedUrl;
          try { await image.decode(); } catch { /* Use initials if image cannot be decoded. */ }
          if (active && image.naturalWidth > 0) setAvatarUrl(signedUrl);
        }
      } catch {
        // No photo, missing migration, or lost connection: initials remain available.
      } finally {
        if (active) setAvatarReady(true);
      }
    };
    void load();
    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
    };
  }, [info?.userId]);

  // Keep the greeting readable for a minimum duration, regardless of connection speed.
  // The animation still waits for the permitted route and the avatar fallback.
  useEffect(() => {
    if (!info) return;
    const durationTimer = window.setTimeout(() => setMinimumElapsed(true), MIN_WELCOME_DURATION_MS);
    return () => window.clearTimeout(durationTimer);
  }, [info]);

  // Fade away only after the destination is ready and the greeting had time to be seen.
  useEffect(() => {
    if (!info || !minimumElapsed || !avatarReady || location === '/' || location === '/login') return;
    const exitTimer = window.setTimeout(() => setExiting(true), 120);
    return () => window.clearTimeout(exitTimer);
  }, [info, minimumElapsed, avatarReady, location]);

  useEffect(() => {
    if (!info || !exiting) return;
    const removeTimer = window.setTimeout(() => {
      setInfo(null);
      setExiting(false);
    }, 280);
    return () => window.clearTimeout(removeTimer);
  }, [info, exiting]);

  // Do not trap users on the overlay if fetching routes or permissions fails.
  useEffect(() => {
    if (!info) return;
    const timeout = window.setTimeout(() => {
      setInfo(null);
      setExiting(false);
    }, 6000);
    return () => window.clearTimeout(timeout);
  }, [info]);

  return (
    <WelcomeContext.Provider value={{ beginWelcome }}>
      {children}
      {info && <WelcomeOverlay info={info} avatarUrl={avatarUrl} exiting={exiting} />}
    </WelcomeContext.Provider>
  );
}
