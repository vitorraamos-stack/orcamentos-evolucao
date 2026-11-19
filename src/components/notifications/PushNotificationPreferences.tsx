import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, CheckCircle2, ChevronDown, Info, Loader2, ShieldCheck, Smartphone } from "lucide-react";
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
  sendPilotPushTest,
  selectPilotPushTestTarget,
  sendRemotePilotPushTest,
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
  pilot_test_disabled: "O envio de teste ainda não foi liberado pela administração.",
  pilot_rate_limited: "Aguarde pelo menos dois minutos entre os testes (máximo de cinco por dia).",
  device_not_registered: "Este dispositivo não está inscrito. Atualize o cadastro e tente novamente.",
  push_provider_unavailable: "O serviço Push não aceitou o teste. Verifique novamente mais tarde.",
  target_not_selected: "Selecione primeiro o celular de destino na Central de Notificações do próprio aparelho.",
  unexpected_payload: "A solicitação de teste não é válida.",
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
  const [expanded, setExpanded] = useState(false);
  const [showPilotTools, setShowPilotTools] = useState(false);
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

  const sendManualTest = async () => {
    if (busy || status !== "active" || !config?.pilotTestEnabled) return;
    // No request is made until the user explicitly confirms this test.
    if (!window.confirm("Enviar uma notificação de teste apenas para este aparelho?")) return;
    setBusy(true);
    setMessage("");
    try {
      const accepted = await sendPilotPushTest(userId);
      if (accepted) toast.success("O serviço Push aceitou o teste. Confirme o recebimento neste aparelho.");
      else setMessage("O serviço Push não confirmou o aceite do teste.");
    } catch (error) {
      setMessage(explainError(error));
    } finally {
      setBusy(false);
    }
  };


  const chooseBackgroundTarget = async () => {
    if (busy || status!=="active" || !config?.pilotTestEnabled) return;
    if (!window.confirm("Definir este aparelho como destino do teste com aplicativo fechado?")) return;
    setBusy(true);
    setMessage("");
    try {
      if (await selectPilotPushTestTarget(userId))
        toast.success("Este aparelho foi definido como destino. Agora abra sua conta no computador.");
      else setMessage("O aparelho não foi definido como destino.");
    } catch (error) {
      setMessage(explainError(error));
    } finally { setBusy(false); }
  };

  const sendBackgroundTest = async () => {
    if (busy || !config?.enabled || !config.pilotTestEnabled) return;
    if (!window.confirm("O aparelho de destino já está bloqueado e com o EvoluSystem fechado? Enviar uma notificação de teste só para ele?")) return;
    setBusy(true);
    setMessage("");
    try {
      if (await sendRemotePilotPushTest(userId))
        toast.success("O provedor aceitou o envio. Confira a notificação no aparelho bloqueado.");
      else setMessage("O provedor não confirmou o aceite.");
    } catch (error) {
      setMessage(explainError(error));
    } finally { setBusy(false); }
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
    <section className={"shrink-0 rounded-xl border border-[var(--evolu-border)] bg-[var(--evolu-field)] p-3 " + (expanded ? "max-h-[min(38dvh,280px)] overflow-y-auto overscroll-contain" : "")} aria-label="Notificações neste dispositivo">
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--evolu-highlight)]"
        aria-expanded={expanded}
        aria-controls="push-device-settings"
        onClick={() => setExpanded(value => !value)}
      >
        <Smartphone className="size-5 shrink-0 text-[var(--evolu-highlight)]" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--evolu-text)]">Notificações no dispositivo</span>
          <span className="mt-0.5 block text-xs text-[var(--evolu-text-muted)]">
            {status === "active" ? "Ativadas neste aparelho" : status === "checking" ? "Verificando dispositivo..." : "Ver configurações de notificações"}
          </span>
        </span>
        {status === "active" && <CheckCircle2 className="size-5 shrink-0 text-[var(--evolu-success)]" aria-label="Dispositivo cadastrado" />}
        {status === "checking" && <Loader2 className="size-5 shrink-0 animate-spin text-[var(--evolu-text-muted)]" aria-hidden="true" />}
        <ChevronDown className={"size-4 shrink-0 text-[var(--evolu-text-muted)] transition-transform " + (expanded ? "rotate-180" : "")} aria-hidden="true" />
      </button>
      {expanded && (
        <div id="push-device-settings" className="mt-3 border-t border-[var(--evolu-border)] pt-3">
          <p className="text-xs leading-relaxed text-[var(--evolu-text-muted)]">{textByStatus[status]}</p>
          {message && <p role="status" className="mt-2 rounded-lg bg-[var(--evolu-field)] px-3 py-2 text-xs text-[var(--evolu-warning)]">{message}</p>}
          {status === "install_required" && (
            <Button type="button" variant="outline" size="sm"
              className="mt-3 border-[var(--evolu-border)] text-[var(--evolu-action-text)]" onClick={openInstallGuide}>
              <Info className="size-4" aria-hidden="true" /> Como instalar no iPhone
            </Button>
          )}
          {config?.enabled && support === "supported" && status !== "checking" &&
            status !== "permission_denied" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(status === "available" || status === "not_synced" || status === "error") && (
                  <Button type="button" size="sm" disabled={busy} onClick={activate}
                    className="bg-[var(--evolu-action-bg)] text-[var(--evolu-action-text)] hover:bg-[var(--evolu-action-hover)]">
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
                    Ativar notificações
                  </Button>
                )}
                {hasBrowserSubscription && (
                  <Button type="button" variant="outline" size="sm" disabled={busy}
                    className="border-[var(--evolu-border)] text-[var(--evolu-action-text)]" onClick={() => { void disable(); }}>
                    Desativar neste aparelho
                  </Button>
                )}
              </div>
            )}
          {hasBrowserSubscription && !config?.enabled && support === "supported" && (
            <Button type="button" variant="outline" size="sm" disabled={busy}
              className="mt-3 border-[var(--evolu-border)] text-[var(--evolu-action-text)]" onClick={() => { void disable(); }}>
              Desativar neste aparelho
            </Button>
          )}
          {status === "error" && (
            <Button type="button" variant="ghost" size="sm" disabled={busy}
              className="mt-2 text-[var(--evolu-action-text)]" onClick={() => { void refresh(); }}>
              Tentar novamente
            </Button>
          )}
          {config?.pilotTestEnabled && (
            <div className="mt-3 rounded-lg border border-[var(--evolu-border)] bg-[var(--evolu-field)] p-3">
              <button type="button" className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-[var(--evolu-text)]"
                aria-expanded={showPilotTools} aria-controls="push-pilot-tools" onClick={() => setShowPilotTools(value => !value)}>
                Ferramentas de teste
                <ChevronDown className={"size-4 shrink-0 transition-transform " + (showPilotTools ? "rotate-180" : "")} aria-hidden="true" />
              </button>
              {showPilotTools && (
                <div id="push-pilot-tools" className="mt-3 space-y-3">
                  {status === "active" && (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={busy}
                        className="border-[var(--evolu-border)] text-[var(--evolu-action-text)]" onClick={() => { void sendManualTest(); }}>
                        {busy ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
                        Enviar teste neste aparelho
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={busy}
                        className="border-[var(--evolu-border)] text-[var(--evolu-action-text)]" onClick={() => { void chooseBackgroundTarget(); }}>
                        <Smartphone className="size-4" aria-hidden="true" />
                        Escolher este aparelho para teste com app fechado
                      </Button>
                    </div>
                  )}
                  <p className="text-xs leading-relaxed text-[var(--evolu-text-muted)]">
                    Para testar com o aplicativo fechado, escolha o aparelho de destino nele próprio.
                    Depois, bloqueie o celular e envie o teste pelo computador usando a mesma conta.
                  </p>
                  <Button type="button" variant="outline" size="sm" disabled={busy}
                    className="border-[var(--evolu-border)] text-[var(--evolu-action-text)]" onClick={() => { void sendBackgroundTest(); }}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
                    Enviar teste ao aparelho escolhido
                  </Button>
                </div>
              )}
            </div>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--evolu-text-muted)]">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Permissão e configurações de notificações são controladas neste aparelho.
          </p>
        </div>
      )}
    </section>
  );
}
