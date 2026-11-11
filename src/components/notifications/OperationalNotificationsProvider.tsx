import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessOperationalSection } from "@/lib/authz";
import { supabase } from "@/lib/supabase";
import { loadNotificationSnapshot } from "@/modules/notifications/notificationsRepository";
import {
  installationScheduleFingerprint,
  projectNotices,
  type InstallationRow,
  type OperationalNotice,
} from "@/modules/notifications/notificationModel";

type ReadState = { userId: string; baseline: number; ids: string[] };
type NotificationContextValue = {
  notices: OperationalNotice[];
  unreadCount: number;
  loading: boolean;
  error: boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  isRead: (notice: OperationalNotice) => boolean;
  refresh: () => void;
};

const emptyContext: NotificationContextValue = {
  notices: [], unreadCount: 0, loading: false, error: false,
  markRead: () => {}, markAllRead: () => {}, isRead: () => true, refresh: () => {},
};
const NotificationContext = createContext<NotificationContextValue>(emptyContext);
const STORAGE_PREFIX = "evolusystem:notification-reads:v4:";
const READ_LIMIT = 250;

function loadReadState(userId: string): ReadState {
  const initial = { userId, baseline: Date.now(), ids: [] as string[] };
  if (!userId) return initial;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + userId);
    if (!raw) {
      window.localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as Partial<ReadState>;
    if (parsed.userId !== userId || typeof parsed.baseline !== "number") return initial;
    return {
      userId,
      baseline: parsed.baseline,
      ids: Array.isArray(parsed.ids) ? parsed.ids.filter(id => typeof id === "string").slice(-READ_LIMIT) : [],
    };
  } catch {
    return initial;
  }
}

function persistReadState(state: ReadState) {
  if (!state.userId) return;
  try { window.localStorage.setItem(STORAGE_PREFIX + state.userId, JSON.stringify(state)); }
  catch { /* Navegação funciona mesmo sem armazenamento local. */ }
}

export function useOperationalNotifications(): NotificationContextValue {
  return useContext(NotificationContext);
}

export function OperationalNotificationsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, hasModuleAccess, hubPermissions } = useAuth();
  const userId = user?.id ?? "";
  const access = { hasModuleAccess, permissions: hubPermissions };
  const canHub = canAccessOperationalSection(access, "orders");
  const canViewArt = canAccessOperationalSection(access, "art");
  const canViewProduction = canAccessOperationalSection(access, "production");
  const canViewInstallations = canAccessOperationalSection(access, "installations");
  const isManager = hubPermissions.isManager;

  const [notices, setNotices] = useState<OperationalNotice[]>([]);
  const [readState, setReadState] = useState<ReadState>(() => loadReadState(userId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const refreshCurrent = useRef<() => void>(() => {});

  useEffect(() => {
    setReadState(loadReadState(userId));
    setNotices([]);
    setError(false);
  }, [userId]);

  useEffect(() => {
    if (authLoading || !userId || !canHub) {
      refreshCurrent.current = () => {};
      setNotices([]);
      setLoading(false);
      return;
    }
    let active = true;
    let inFlight = false;
    let firstLoad = true;
    let previousIds = new Set<string>();
    let earlierInstallations: Map<string, string> | null = null;
    let changedInstallations: InstallationRow[] = [];
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);

    const refresh = async () => {
      if (!active || inFlight || !navigator.onLine) return;
      inFlight = true;
      try {
        const snapshot = await loadNotificationSnapshot(userId, canViewInstallations);
        if (!active) return;
        const currentFingerprints = new Map(
          snapshot.installations.map(row => [row.id, installationScheduleFingerprint(row)])
        );
        if (earlierInstallations) {
          const changes = snapshot.installations.filter(row =>
            earlierInstallations?.has(row.id) &&
            earlierInstallations.get(row.id) !== currentFingerprints.get(row.id)
          );
          if (changes.length) {
            const next = new Map(changedInstallations.map(row => [row.id, row]));
            for (const row of changes) next.set(row.id, row);
            changedInstallations = [...next.values()].slice(-40);
          }
        }
        earlierInstallations = currentFingerprints;

        const nextNotices = projectNotices(
          snapshot.events,
          snapshot.installations,
          {
            userId,
            canViewArt,
            canViewProduction,
            canViewInstallations,
            isManager,
            teamIds: snapshot.teamIds,
          },
          snapshot.saleNumbers,
          changedInstallations
        );
        const newlyArrived = firstLoad
          ? []
          : nextNotices.filter(item => !previousIds.has(item.id));
        previousIds = new Set(nextNotices.map(item => item.id));
        firstLoad = false;
        setNotices(nextNotices);
        setError(false);
        if (newlyArrived.length && document.visibilityState === "visible") {
          toast.info("Novo aviso operacional", { description: newlyArrived[0].title, duration: 5000 });
        }
      } catch {
        if (active) setError(true);
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { void refresh(); }, 1200);
    };
    refreshCurrent.current = () => { void refresh(); };
    void refresh();

    // os_orders_event não integra a publicação Realtime atual: consulta periódica
    // é necessária para captar eventos de Arte e de atribuição, sem migrations.
    const poll = window.setInterval(() => { void refresh(); }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onOnline = () => { void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    const channel = supabase.channel("pwa-v4-notices-" + userId)
      .on("postgres_changes", { event: "*", schema: "public", table: "os_order_assignees", filter: "user_id=eq." + userId }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "os_orders" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "os_installations" }, scheduleRefresh)
      .subscribe();

    return () => {
      active = false;
      refreshCurrent.current = () => {};
      clearInterval(poll);
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      void supabase.removeChannel(channel);
    };
  }, [authLoading, userId, canHub, canViewArt, canViewProduction, canViewInstallations, isManager]);

  const isRead = useCallback((notice: OperationalNotice) => (
    readState.userId !== userId ||
    readState.ids.includes(notice.id) ||
    Date.parse(notice.createdAt) <= readState.baseline
  ), [readState, userId]);

  const markRead = useCallback((id: string) => {
    if (!userId) return;
    setReadState(previous => {
      const state = previous.userId === userId ? previous : loadReadState(userId);
      if (state.ids.includes(id)) return state;
      const next = { ...state, ids: [...state.ids, id].slice(-READ_LIMIT) };
      persistReadState(next);
      return next;
    });
  }, [userId]);

  const markAllRead = useCallback(() => {
    if (!userId) return;
    setReadState(previous => {
      const state = previous.userId === userId ? previous : loadReadState(userId);
      const allIds = [...new Set([...state.ids, ...notices.map(notice => notice.id)])].slice(-READ_LIMIT);
      const next = { ...state, ids: allIds, baseline: Date.now() };
      persistReadState(next);
      return next;
    });
  }, [userId, notices]);

  const unreadCount = useMemo(() => notices.filter(item => !isRead(item)).length, [notices, isRead]);

  const value = useMemo(() => ({
    notices: canHub && userId ? notices : [],
    unreadCount: canHub && userId ? unreadCount : 0,
    loading, error, markRead, markAllRead, isRead,
    refresh: () => refreshCurrent.current(),
  }), [notices, unreadCount, loading, error, markRead, markAllRead, isRead, canHub, userId]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
