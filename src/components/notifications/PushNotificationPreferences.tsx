import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, CheckCircle2, Info, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePwaExperience } from "@/components/pwa/PwaExperience";
import {
  getBrowserPushAvailability,
  getCurrentPushSubscription,
  isCurrentPushRegistered,
  loadPushConfig,
  pushAuthToken,
  registerBrowserPush,
  revokeBrowserPush,
  type PushAvailability,
  type PushPublicConfig,
  PushConsentError,
} from "@/modules/notifications/pushConsent";

type DeviceStatus =
  | "checking" | "disabled" | "available" | "active"
  | "not_synced" | "unsupported" | "install_required" | "permission_denied" | "insecure" | "error";

const errorText: Record<string, string> = {
  unauthorized: "Sua sessão expirou. Entre novamente para configurar as notificações.",
  module_denied: "Seu perfil não possui permissão para ativar esse recurso.",
  endpoint_unavailable: "Este dispositivo já está associado a outra conta. Desative a inscrição atual e tente novamente.",
  device_limit: "Sua conta atingiu o limite de cinco dispositivos.",
  invalid_subscription: "Não foi possível validar as informações do dispositivo.",
  worker_unavailable: "O aplicativo ainda não está preparado neste navegador. Reabra o EvoluSystem.",
  invalid_public_key: "A configuração do serviço de notificações precisa ser corrigida.",
  push_registration_disabled: "O administrador ainda não ativou o cadastro de dispositivos.",
  browser_unsubscribe_failed: "O navegador não conseguiu desativar a inscrição. Tente novamente.",
  network_error: "Não foi possível conectar ao servidor. Confira a internet e tente novamente.",
};

function explainError(error: unknown): string {
  return error instanceof PushConsentError
    ? errorText[error.code] ?? "Não foi possível concluir a operação."
    : "O navegador não conseguiu concluir a operação. Tente novamente.";
}

/**
 * Only mounted when the notification center dialog is opened.
 * Never triggers Notification.requestPermission from an effect.
 */
export function PushNotificationPreferences({ userId }: { userId: string }) {
  const { installed, openInstallGuide } = usePwaExperience();
  const [status, setStatus] = useState<DeviceStatus>("checking");
  const [support, setSupport] = useState<PushAvailability>("unsupported");
  const [config, setConfig] = useState<PushPublicConfig | null>(null);
  const [hasBrowserSubscription, setHasBrowserSubscription] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setMessage("");
    setHasBrowserSubscription(false);
    setStatus("checking");
    const available = getBrowserPushAvailability(installed);
    setSupport(available);
    try {
      const fetched = await loadPushConfig(userId);
      if (generation.current !== current) return;
      setConfig(fetched);
      if (available !== "supported") {
        setStatus(available);
        return;
      }

      const local = await getCurrentPushSubscription();
      if (generation.current !== current) return;
      setHasBrowserSubscription(Boolean(local));
      if (!fetched.enabled) {
        setStatus("disabled");
        return;
      }
      if (!local) {
        setStatus("available");
        return;
      }

      const token = await pushAuthToken(userId);
      const linked = await isCurrentPushRegistered(token, local.endpoint);
      if (generation.current !== current) return;
      setStatus(linked ? "active" : "not_synced");
    } catch (error) {
      if (generation.current !== current) return;
      setStatus("error");
      setMessage(explainError(error));
    }
  }, [installed, userId]);

  useEffect(() => {
    void refresh();
    return () => { generation.current += 1; };
  }, [refresh]);

  const activate = () => {
    // CRITICAL: requestPermission must be called synchronously from a real
    // button click on iOS; no awaited network calls before this gesture.
    if (busy || !config?.enabled || !config.publicKey || status === "checking" ||
        support !== "supported") return;

    let permissionRequest: Promise<NotificationPermission>;
    try {
      permissionRequest = Notification.permission === "default"
        ? Notification.requestPermission()
        : Promise.resolve(Notification.permission);
    } catch {
      setMessage("O navegador não conseguiu solicitar permissão.");
      return;
    }

    setBusy(true);
    setMessage("");
    void (async () => {
      try {
        const permission = await permissionRequest;
        if (permission !== "granted") {
          setMessage(permission === "denied"
            ? "Notificações bloqueadas. Altere a permissão nas configurações do navegador ou do aplicativo."
            : "A ativação depende da sua autorização no dispositivo.");
          setStatus(permission === "denied" ? "permission_denied" : "available");
          return;
        }
        const token = await pushAuthToken(userId);
        await registerBrowserPush(config.publicKey!, token);
        toast.success("Dispositivo cadastrado para notificações.");
        await refresh();
      } catch (error) {
        setMessage(explainError(error));
      } finally {
        setBusy(false);
      }
    })();
  };

  const disable = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const token = await pushAuthToken(userId);
      const result = await revokeBrowserPush(token);
      await refresh();
      if (!result.serverRevoked) {
        setMessage("Notificações desativadas neste aparelho, mas o servidor não confirmou a revogação. A inscrição expirada será tratada pelo serviço de limpeza.");
      } else {
        toast.success("Notificações desativadas neste aparelho.");
      }
    } catch (error) {
      setMessage(explainError(error));
    } finally {
      setBusy(false);
    }
  };

  const textByStatus: Record<DeviceStatus, string> = {
    checking: "Verificando disponibilidade neste dispositivo...",
    disabled: "Cadastro Push em preparação. Os avisos dentro do EvoluSystem continuam funcionando.",
    available: "Disponível para ativação quando você autorizar no dispositivo.",
    active: "Este dispositivo está vinculado à sua conta para receber avisos.",
    not_synced: "O navegador possui uma inscrição, mas ela ainda não está vinculada a esta conta.",
    unsupported: "Este navegador não oferece os recursos necessários para notificações Push.",
    insecure: "Para ativar notificações, acesse o EvoluSystem em uma conexão HTTPS segura.",
    install_required: "No iPhone/iPad, adicione o EvoluSystem à Tela de Início e abra pelo ícone instalado.",
    permission_denied: "A permissão está bloqueada. Libere-a nas configurações do dispositivo.",
    error: "Não foi possível verificar o status do Push agora.",
  };

  return (
    <section className="rounded-xl border border-[#355674] bg-[#1B354C] p-3" aria-label="Notificações neste dispositivo">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-[#54C8FF]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[#ECF7FF]">Notificações no dispositivo</h3>
          <p className="mt-1 text-xs leading-relaxed text-[#B8CDE1]">{textByStatus[status]}</p>
        </div>
        {status === "active" && <CheckCircle2 className="size-5 shrink-0 text-[#86E5AD]" aria-label="Dispositivo cadastrado" />}
        {status === "checking" && <Loader2 className="size-5 shrink-0 animate-spin text-[#9CCBE5]" aria-hidden="true" />}
      </div>
      {message && <p role="status" className="mt-2 rounded-lg bg-[#2F3C4D] px-3 py-2 text-xs text-[#F7D6BD]">{message}</p>}
      {status === "install_required" && (
        <Button type="button" variant="outline" size="sm"
          className="mt-3 border-[#50708D] text-[#E2F2FF]"
          onClick={openInstallGuide}>
          <Info className="size-4" aria-hidden="true" /> Como instalar no iPhone
        </Button>
      )}
      {config?.enabled && support === "supported" && status !== "checking" &&
        status !== "permission_denied" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(status === "available" || status === "not_synced" || status === "error") && (
              <Button type="button" size="sm" disabled={busy} onClick={activate}
                className="bg-[#126B9D] text-white hover:bg-[#177DAE]">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
                Ativar notificações
              </Button>
            )}
            {hasBrowserSubscription && (
              <Button type="button" variant="outline" size="sm" disabled={busy}
                className="border-[#59728A] text-[#E6F2FC]" onClick={() => { void disable(); }}>
                Desativar neste aparelho
              </Button>
            )}
          </div>
        )}
      {hasBrowserSubscription && !config?.enabled && support === "supported" && (
        <Button type="button" variant="outline" size="sm" disabled={busy}
          className="mt-3 border-[#59728A] text-[#E6F2FC]" onClick={() => { void disable(); }}>
          Desativar neste aparelho
        </Button>
      )}
      {status === "error" && (
        <Button type="button" variant="ghost" size="sm" disabled={busy}
          className="mt-2 text-[#CAE4F7]" onClick={() => { void refresh(); }}>
          Tentar novamente
        </Button>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-[#96B4CA]">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        O aplicativo só solicita permissão após você tocar em ativar. O envio com o app fechado depende da próxima etapa de implantação.
      </p>
    </section>
  );
}
