import { useEffect, useMemo, useState } from 'react';

const padTime = (value: number) => value.toString().padStart(2, '0');

export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
};

export const useClock = () => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);

    return () => window.clearInterval(timer);
  }, []);

  return useMemo(() => `${padTime(now.getHours())}:${padTime(now.getMinutes())}`, [now]);
};

export const useFullscreen = () => {
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  useEffect(() => {
    const syncState = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', syncState);
    return () => document.removeEventListener('fullscreenchange', syncState);
  }, []);

  const enterFullscreen = async () => {
    if (document.fullscreenElement) return;
    await document.documentElement.requestFullscreen();
  };

  const exitFullscreen = async () => {
    if (!document.fullscreenElement) return;
    await document.exitFullscreen();
  };

  return {
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
  };
};
