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
        className={"relative h-11 w-11 shrink-0 rounded-xl border border-[#385775] text-[#B9D3EC] hover:bg-[#1E415F] hover:text-white " + className}
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
        <DialogContent className="flex max-h-[min(85dvh,720px)] flex-col gap-3 overflow-hidden border-[#36516B] bg-[#15263B] p-4 text-[#F1F7FD] sm:max-w-[510px] sm:p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Bell className="size-5 text-[#52C4FA]" aria-hidden="true" />
              Notificações
              {unreadCount > 0 && <span className="rounded-full bg-[#D95D57] px-2 py-0.5 text-xs text-white">{unreadCount}</span>}
            </DialogTitle>
            <DialogDescription className="text-[#ADC5DC]">
              Avisos relevantes para sua função. Toque para abrir o pedido ou a agenda.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-[#CBDFEF] hover:bg-[#25425C]"
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
              className="text-[#CBDFEF] hover:bg-[#25425C]"
              onClick={markAllRead}
              disabled={unreadCount === 0}
            >
              <CheckCheck className="size-4" aria-hidden="true" />
              Marcar todas como lidas
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-1" role="list" aria-label="Histórico de avisos">
            {error && (
              <p role="alert" className="rounded-lg border border-[#785348] bg-[#392D2B] p-3 text-sm text-[#FFD4CA]">
                Não foi possível atualizar os avisos. Confira sua conexão e tente novamente.
              </p>
            )}
            {!notices.length && (
              <p className="rounded-xl border border-[#354D66] bg-[#1C3249] p-5 text-center text-sm text-[#B7CBE0]">
                {loading ? "Consultando avisos..." : "Nenhuma notificação operacional nos últimos 14 dias."}
              </p>
            )}
            {notices.map(notice => {
              const read = isRead(notice);
              return (
                <button
                  key={notice.id}
                  type="button"
                  role="listitem"
                  className={
                    "w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#65C5FA] " +
                    (read
                      ? "border-[#31465D] bg-[#1A2D42] hover:bg-[#24405A]"
                      : "border-[#2B6789] bg-[#153852] hover:bg-[#224F70]")
                  }
                  onClick={() => {
                    markRead(notice.id);
                    setOpen(false);
                    setLocation(notice.href);
                  }}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-[#F1F7FD]">
                      {!read && <span className="size-2 shrink-0 rounded-full bg-[#55C8FF]" aria-label="Não lida" />}
                      {notice.title}
                    </span>
                    <span className="shrink-0 text-xs text-[#9FB9D2]">{timeLabel(notice.createdAt)}</span>
                  </span>
                  <span className="mt-1 block text-sm text-[#C5D7E9]">{notice.description}</span>
                </button>
              );
            })}
          </div>
          <p className="border-t border-[#344C64] pt-3 text-xs leading-relaxed text-[#9FB7CD]">
            Histórico de 14 dias. Os avisos são atualizados com o sistema aberto. Notificações push com o app fechado estão em preparação.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
