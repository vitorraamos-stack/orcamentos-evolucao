import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, RefreshCw, Share2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type PromptChoice = { outcome: "accepted" | "dismissed"; platform: string };
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<PromptChoice>;
}
type PwaContextValue = { installed: boolean; openInstallGuide: () => void };
const PwaContext = createContext<PwaContextValue | null>(null);

export function usePwaExperience(): PwaContextValue {
  const context = useContext(PwaContext);
  if (!context) throw new Error("usePwaExperience requires PwaExperienceProvider");
  return context;
}

function isStandalone(): boolean {
  return (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isAppleMobile(): boolean {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function PwaExperienceProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(isStandalone);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const updateRequested = useRef(false);
  const appleMobile = isAppleMobile();

  useEffect(() => {
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setInstallGuideOpen(false);
    };
    const syncDisplayMode = () => setInstalled(isStandalone());
    const displayMode = typeof window.matchMedia === "function" ? window.matchMedia("(display-mode: standalone)") : null;
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    displayMode?.addEventListener?.("change", syncDisplayMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      displayMode?.removeEventListener?.("change", syncDisplayMode);
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;
    let lastCheck = 0;
    const trackedWorkers = new WeakSet<ServiceWorker>();

    const inspectWaiting = () => {
      if (!cancelled && navigator.serviceWorker.controller && registration?.waiting) {
        setWaitingWorker(registration.waiting);
      }
    };
    const watchInstalling = (worker: ServiceWorker | null) => {
      if (!worker || trackedWorkers.has(worker)) return;
      trackedWorkers.add(worker);
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed") inspectWaiting();
      });
    };
    const onUpdateFound = () => watchInstalling(registration?.installing ?? null);
    const checkForUpdate = () => {
      if (!registration || document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastCheck < 30 * 60 * 1000) return;
      lastCheck = now;
      void registration.update().catch(() => { /* A navegação existente continua funcionando. */ });
    };
    const onControllerChange = () => {
      if (updateRequested.current) window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("online", checkForUpdate);
    const interval = window.setInterval(checkForUpdate, 60 * 60 * 1000);
    void navigator.serviceWorker.ready.then(current => {
      if (cancelled) return;
      registration = current;
      registration.addEventListener("updatefound", onUpdateFound);
      watchInstalling(registration.installing);
      inspectWaiting();
      checkForUpdate();
    }).catch(() => { /* PWA continua funcional como site. */ });

    return () => {
      cancelled = true;
      if (registration) registration.removeEventListener("updatefound", onUpdateFound);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", checkForUpdate);
      window.removeEventListener("online", checkForUpdate);
      window.clearInterval(interval);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstallGuideOpen(false);
    } catch {
      // Instruções manuais permanecem disponíveis.
    } finally {
      // beforeinstallprompt só pode ser consumido uma vez.
      setInstallPrompt(null);
    }
  }, [installPrompt]);

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return;
    setUpdating(true);
    updateRequested.current = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }, [waitingWorker]);

  return (
    <PwaContext.Provider value={{ installed, openInstallGuide: () => setInstallGuideOpen(true) }}>
      {children}
      <Dialog open={installGuideOpen && !installed} onOpenChange={setInstallGuideOpen}>
        <DialogContent className="border-[#37516B] bg-[#17283D] text-[#F1F7FD] sm:max-w-md">
          <DialogHeader>
            <div className="mb-3 flex items-center gap-3">
              <img src="/evolusystem-icon.svg" width="52" height="52" alt="" className="rounded-xl" />
              <div>
                <DialogTitle className="text-xl">Instalar EvoluSystem</DialogTitle>
                <DialogDescription className="mt-1 text-[#B9CCDE]">
                  Acesse o sistema diretamente pela tela inicial do seu celular.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {appleMobile ? (
            <div className="space-y-3 text-sm leading-relaxed text-[#D8E5F1]">
              <p>Para adicionar o EvoluSystem no iPhone ou iPad:</p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>Toque em <strong>Compartilhar</strong> <Share2 className="inline size-4" aria-hidden="true" /> no navegador.</li>
                <li>Selecione <strong>Adicionar à Tela de Início</strong>.</li>
                <li>Ative <strong>Abrir como App da Web</strong>, se essa opção aparecer, e toque em <strong>Adicionar</strong>.</li>
              </ol>
            </div>
          ) : installPrompt ? (
            <p className="text-sm leading-relaxed text-[#D8E5F1]">
              O navegador está pronto para instalar o EvoluSystem. Toque em <strong>Instalar agora</strong> para confirmar.
            </p>
          ) : (
            <div className="space-y-2 text-sm leading-relaxed text-[#D8E5F1]">
              <p>Abra o menu do navegador e procure <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</p>
              <p className="text-[#AFC4D8]">Se a opção não aparecer, verifique se está usando HTTPS e um navegador compatível.</p>
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" className="border-[#52708E] text-[#E7F3FF]" onClick={() => setInstallGuideOpen(false)}>
              Entendi
            </Button>
            {!appleMobile && installPrompt && (
              <Button type="button" onClick={() => { void install(); }}>
                <Download aria-hidden="true" /> Instalar agora
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {waitingWorker && !updateDismissed && (
        <section
          role="status"
          aria-live="polite"
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] rounded-xl border border-[#416580] bg-[#17283D] p-4 text-[#F1F7FD] shadow-2xl sm:left-auto sm:right-5 sm:w-[370px]"
        >
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 size-5 shrink-0 text-[#55C8FF]" aria-hidden="true" />
            <div>
              <p className="font-semibold">Nova versão disponível</p>
              <p className="mt-1 text-sm leading-relaxed text-[#B9CCDE]">
                Salve alterações em andamento antes de atualizar o EvoluSystem.
              </p>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" className="text-[#D8E5F1]" onClick={() => setUpdateDismissed(true)} disabled={updating}>
              Depois
            </Button>
            <Button type="button" onClick={applyUpdate} disabled={updating}>
              <RefreshCw aria-hidden="true" className={updating ? "animate-spin" : ""} />
              {updating ? "Atualizando..." : "Atualizar"}
            </Button>
          </div>
        </section>
      )}
    </PwaContext.Provider>
  );
}
