import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type {
  OrderDeletionPreview,
  OrderDeletionResult,
} from "../repositories/orderGovernanceRepository";

const labels: Record<string, string> = {
  items: "itens",
  item_operations: "operações",
  assets: "arquivos",
  asset_jobs: "processamentos",
  finance_installments: "parcelas",
  installations: "instalações",
  installation_checklist: "itens de checklist",
  installation_evidence: "evidências",
  deliveries: "entregas",
  order_events: "eventos",
  legacy_os_events: "eventos legados",
  flow_state: "estados do fluxo",
  kiosk_rows: "itens do quiosque",
  installation_feedbacks: "feedbacks",
  assignees: "responsáveis",
  comments: "comentários",
  deadlines: "prazos",
};

type Props = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  loadPreview: () => Promise<OrderDeletionPreview>;
  onDelete: (reason: string, confirmation: string) => Promise<OrderDeletionResult>;
  onArchive: () => void;
  onCleanup: (result: OrderDeletionResult) => Promise<boolean>;
  onGoToCentral: () => void;
};

export function DeleteOrderDialog({
  open,
  onOpenChange,
  loadPreview,
  onDelete,
  onArchive,
  onCleanup,
  onGoToCentral,
}: Props) {
  const [preview, setPreview] = useState<OrderDeletionPreview | null>(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletedResult, setDeletedResult] = useState<OrderDeletionResult | null>(null);
  const [cleanupPending, setCleanupPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setError("");
    setReason("");
    setConfirmation("");
    setDeletedResult(null);
    setCleanupPending(false);

    void loadPreview()
      .then(setPreview)
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar o impacto.",
        ),
      );
  }, [open, loadPreview]);

  const attemptCleanup = async (result: OrderDeletionResult) => {
    setBusy(true);
    setCleanupPending(false);
    try {
      const completed = await onCleanup(result);
      if (!completed) setCleanupPending(true);
    } catch {
      setCleanupPending(true);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (deletedResult) return;
    setBusy(true);
    setError("");
    try {
      const result = await onDelete(reason, confirmation);
      setDeletedResult(result);
      setBusy(false);
      await attemptCleanup(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir.");
      setBusy(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (deletedResult && !next) return;
    if (busy && !next) return;
    onOpenChange(next);
  };

  const confirmationMatches =
    preview &&
    confirmation.trim().toLocaleLowerCase() ===
      preview.expected_confirmation.toLocaleLowerCase();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {deletedResult ? (
          <>
            <DialogHeader>
              <DialogTitle>OS excluída do sistema</DialogTitle>
              <DialogDescription>
                A exclusão definitiva do banco já foi concluída. Não execute o hard
                delete novamente.
              </DialogDescription>
            </DialogHeader>

            {cleanupPending ? (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>Limpeza de arquivos pendente</AlertTitle>
                <AlertDescription>
                  A OS já foi excluída do sistema, mas alguns arquivos do armazenamento
                  ainda precisam ser limpos. Você pode tentar novamente com segurança.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <CheckCircle2 />
                <AlertTitle>Exclusão concluída no banco</AlertTitle>
                <AlertDescription>
                  {busy
                    ? "Finalizando a limpeza dos arquivos do armazenamento..."
                    : "Aguardando confirmação da limpeza dos arquivos."}
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-md border p-3 text-sm">
              <p>
                <strong>OS #{deletedResult.display_number}</strong>
              </p>
              <p>{deletedResult.client_name}</p>
              <p className="mt-2 text-muted-foreground">
                {deletedResult.r2_keys.length} arquivo(s) vinculado(s) ao cleanup.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onGoToCentral} disabled={busy}>
                Ir para Central
              </Button>
              {cleanupPending ? (
                <Button onClick={() => void attemptCleanup(deletedResult)} disabled={busy}>
                  {busy ? "Limpando..." : "Tentar limpar arquivos novamente"}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Excluir OS definitivamente?</DialogTitle>
              <DialogDescription>
                Esta ação é irreversível. Use somente para OS de teste, criadas por
                engano ou duplicadas sem histórico. Para cancelamentos reais, utilize
                Arquivar OS.
              </DialogDescription>
            </DialogHeader>

            {!preview && !error ? <Skeleton className="h-40" /> : null}

            {error ? (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>Não foi possível continuar</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {preview ? (
              <div className="space-y-4">
                <div className="rounded-md border p-3">
                  <strong>OS #{preview.order.display_number}</strong>
                  <p>{preview.order.client_name}</p>
                  <p className="text-sm text-muted-foreground">
                    Status: {preview.order.prod_status ?? preview.order.art_status}
                  </p>
                </div>

                {preview.blockers.length > 0 ? (
                  <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertTitle>Exclusão bloqueada</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc pl-5">
                        {preview.blockers.map((blocker) => (
                          <li key={blocker.code}>{blocker.message}</li>
                        ))}
                      </ul>
                      <p className="mt-2">
                        Arquive a OS para removê-la da operação preservando o histórico.
                      </p>
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div>
                  <p className="font-medium">Esta exclusão removerá:</p>
                  <div className="grid grid-cols-2 gap-1 text-sm">
                    {Object.entries(preview.counts)
                      .filter(([, count]) => count > 0)
                      .map(([key, count]) => (
                        <span key={key}>
                          {count} {labels[key] ?? key}
                        </span>
                      ))}
                  </div>
                  {preview.r2_object_count > 0 ? (
                    <p className="mt-2 text-sm">
                      {preview.r2_object_count} arquivo(s) do armazenamento serão
                      removidos.
                    </p>
                  ) : null}
                </div>

                {preview.allowed ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="delete-reason">Motivo da exclusão</Label>
                      <Textarea
                        id="delete-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="delete-confirmation">
                        Digite {preview.expected_confirmation} para confirmar
                      </Label>
                      <Input
                        id="delete-confirmation"
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            <DialogFooter>
              {preview && !preview.allowed ? (
                <Button onClick={onArchive}>Arquivar OS</Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancelar
              </Button>
              {preview?.allowed ? (
                <Button
                  variant="destructive"
                  onClick={() => void submit()}
                  disabled={
                    busy || reason.trim().length < 5 || !confirmationMatches
                  }
                >
                  {busy ? "Excluindo..." : "Excluir definitivamente"}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
