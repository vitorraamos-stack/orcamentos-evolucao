import { useState } from "react";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessOperationalSection } from "@/lib/authz";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useOperationalNotifications } from "./OperationalNotificationsProvider";
import { PushNotificationPreferences } from "./PushNotificationPreferences";

function timeLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function NotificationBell({ className = "" }: { className?: string }) {
  const { user, hasModuleAccess, hubPermissions } = useAuth();
  const enabled = Boolean(user) && canAccessOperationalSection(
    { hasModuleAccess, permissions: hubPermissions }, "orders"
  );
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { notices, unreadCount, isRead, markRead, markAllRead, refresh, loading, error } = useOperationalNotifications();

  if (!enabled) return null;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={"relative h-11 w-11 shrink-0 rounded-xl border border-[var(--evolu-border)] text-[var(--evolu-text-muted)] hover:bg-[var(--evolu-action-bg)] hover:text-[var(--evolu-action-text)] " + className}
        onClick={() => setOpen(true)}
        aria-label={unreadCount ? "Notificações: " + unreadCount + " não lidas" : "Abrir central de notificações"}
        title="Notificações"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="evolu-notifications__badge" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(90dvh,760px)] max-h-[90dvh] flex-col gap-3 overflow-hidden border-[var(--evolu-border)] bg-[var(--evolu-panel)] p-4 text-[var(--evolu-text)] sm:max-w-[540px] sm:p-5">
          <DialogHeader className="shrink-0 pr-6">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Bell className="size-5 text-[var(--evolu-highlight)]" aria-hidden="true" />
              Notificações
              {unreadCount > 0 && <span className="rounded-full bg-[var(--evolu-danger)] px-2 py-0.5 text-xs text-[var(--evolu-page)]">{unreadCount}</span>}
            </DialogTitle>
            <DialogDescription className="text-[var(--evolu-text-muted)]">
              Avisos recentes. Toque em um item para abrir a OS ou a agenda.
            </DialogDescription>
          </DialogHeader>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-[var(--evolu-action-text)] hover:bg-[var(--evolu-action-bg)]"
              disabled={loading}
              onClick={refresh}
              aria-label="Atualizar notificações"
            >
              <RefreshCw className={"size-4 " + (loading ? "animate-spin" : "")} aria-hidden="true" />
              Atualizar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-[var(--evolu-action-text)] hover:bg-[var(--evolu-action-bg)]"
              onClick={markAllRead}
              disabled={unreadCount === 0}
            >
              <CheckCheck className="size-4" aria-hidden="true" />
              Marcar todas como lidas
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-2" role="region" aria-label="Histórico de avisos" tabIndex={0}>
            <p className="sticky top-0 z-10 bg-[var(--evolu-panel)] pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--evolu-text-muted)]">Últimos 14 dias</p>
            {error && (
              <p role="alert" className="rounded-lg border border-[var(--evolu-danger)]/40 bg-[var(--evolu-panel-raised)] p-3 text-sm text-[var(--evolu-danger)]">
                Não foi possível atualizar os avisos. Confira sua conexão e tente novamente.
              </p>
            )}
            {!notices.length && (
              <p className="rounded-xl border border-[var(--evolu-border)] bg-[var(--evolu-panel-raised)] p-5 text-center text-sm text-[var(--evolu-text-muted)]">
                {loading ? "Consultando avisos..." : "Nenhuma notificação operacional nos últimos 14 dias."}
              </p>
            )}
            {notices.map(notice => {
              const read = isRead(notice);
              return (
                <button
                  key={notice.id}
                  type="button"
                   className={
                    "w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--evolu-highlight)] " +
                    (read
                      ? "border-[var(--evolu-border)] bg-[var(--evolu-panel)] hover:bg-[var(--evolu-panel-raised)]"
                      : "border-[var(--evolu-highlight)]/60 bg-[var(--evolu-panel-raised)] hover:bg-[var(--evolu-action-bg)]")
                  }
                  onClick={() => {
                    markRead(notice.id);
                    setOpen(false);
                    setLocation(notice.href);
                  }}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-[var(--evolu-text)]">
                      {!read && <span className="size-2 shrink-0 rounded-full bg-[var(--evolu-highlight)]" aria-label="Não lida" />}
                      {notice.title}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--evolu-text-muted)]">{timeLabel(notice.createdAt)}</span>
                  </span>
                  <span className="mt-1 block text-sm text-[var(--evolu-text-muted)]">{notice.description}</span>
                </button>
              );
            })}
          </div>
          <PushNotificationPreferences userId={user!.id} />
        </DialogContent>
      </Dialog>
    </>
  );
}
