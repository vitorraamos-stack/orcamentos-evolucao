import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Redirect, useRoute } from "wouter";
import { MapPin, Navigation, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MutationInputDialog } from "@/shared/components/MutationInputDialog";
import { InstallationChecklist } from "../components/InstallationChecklist";
import { InstallationPhotoUploader } from "../components/InstallationPhotoUploader";
import { InstallationEvidenceGallery } from "../components/InstallationEvidenceGallery";
import { InstallationCompletionReadiness } from "../components/InstallationCompletionReadiness";
import {
  forceCompleteInstallation,
  loadInstallationExecution,
  saveCompletionNotes,
  setChecklistItem,
  uploadInstallationEvidence,
} from "../repositories/installationExecutionRepository";
import { installationAction } from "../repositories/installationsRepository";
import {
  editCompletionNotesDraft,
  freshCompletionNotesDraft,
  receiveCompletionNotes,
  resetCompletionNotesToLatest,
} from "../services/completionNotesDraft";
import type { CompletionNotesDraft } from "../services/completionNotesDraft";
import {
  buildMapsUrl,
  buildWazeUrl,
  formatAgendaDate,
  INSTALLATION_STATUS_LABEL,
} from "../services/installations";
import {
  getInstallationCompletionReadiness,
  isChecklistReady,
} from "../services/installationExecution";
import type {
  Installation,
  InstallationChecklistItem,
  InstallationChecklistStatus,
  InstallationEvidence,
  InstallationEvidencePhase,
} from "../types";

export default function InstallationExecutionPage() {
  const { hubPermissions } = useAuth();
  const [, params] = useRoute("/instalacoes/execucao/:id");
  const [installation, setInstallation] = useState<Installation | null>(null);
  const [items, setItems] = useState<InstallationChecklistItem[]>([]);
  const [evidence, setEvidence] = useState<InstallationEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingChecklistItemId, setSavingChecklistItemId] = useState<string | null>(null);
  const checklistSaveRef = useRef(false);
  const [uploading, setUploading] = useState<InstallationEvidencePhase | null>(
    null
  );
  const [notesDraft, setNotesDraft] = useState<CompletionNotesDraft>(() => freshCompletionNotesDraft(null));
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaveError, setNotesSaveError] = useState<string | null>(null);
  const notesSavingRef = useRef(false);
  const loadSequenceRef = useRef(0);
  const [override, setOverride] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const load = useCallback(async () => {
    if (!params?.id) return;
    const sequence = ++loadSequenceRef.current;
    try {
      const data = await loadInstallationExecution(params.id);
      if (sequence !== loadSequenceRef.current) return;
      setInstallation(data.installation);
      setItems(data.checklist);
      setEvidence(data.evidence);
      // Realtime and checklist refreshes must never overwrite unsaved notes.
      setNotesDraft(previous => receiveCompletionNotes(previous, data.installation));
    } catch (e) {
      if (sequence === loadSequenceRef.current) toast.error((e as Error).message);
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false);
    }
  }, [params?.id]);
  useEffect(() => {
    void load();
    if (!params?.id) return;
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void load(), 250);
    };
    const channel = supabase
      .channel(`installation-execution-${params.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "os_installations",
          filter: `id=eq.${params.id}`,
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "os_installation_checklist_items",
          filter: `installation_id=eq.${params.id}`,
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "os_installation_evidence",
          filter: `installation_id=eq.${params.id}`,
        },
        refresh
      )
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [load, params?.id]);
  if (!hubPermissions.canExecuteInstallations)
    return <Redirect to="/instalacoes" />;
  if (loading)
    return <main className="mx-auto max-w-lg p-6">Carregando execução…</main>;
  if (!installation)
    return (
      <main className="mx-auto max-w-lg p-6">Instalação não encontrada.</main>
    );
  const pre = items.filter(i => i.phase === "PRE_START"),
    completion = items.filter(i => i.phase === "COMPLETION");
  const preReady = isChecklistReady(items, "PRE_START");
  const readiness = getInstallationCompletionReadiness(
    installation.status,
    items,
    evidence
  );
  const readonly = ["COMPLETED", "CANCELLED"].includes(installation.status);
  const notesDirty = notesDraft.text !== notesDraft.baseText;
  const notesActiveInstallation = notesDraft.installationId === installation.id;
  const updateChecklist = async (item: InstallationChecklistItem, status: InstallationChecklistStatus) => {
    if (checklistSaveRef.current) return;
    checklistSaveRef.current = true;
    setSavingChecklistItemId(item.id);
    try {
      await setChecklistItem(item, status);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      // In success and conflict, the server remains authoritative.
      // Show its latest state without allowing a second click in flight.
      try {
        await load();
      } finally {
        checklistSaveRef.current = false;
        setSavingChecklistItemId(null);
      }
    }
  };
  const action = async (kind: "start" | "complete") => {
    setBusy(true);
    try {
      await installationAction(kind, installation.id);
      toast.success(
        kind === "start"
          ? "Instalação iniciada."
          : "Instalação concluída com sucesso."
      );
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const upload = async (phase: InstallationEvidencePhase, file: File) => {
    setUploading(phase);
    try {
      await uploadInstallationEvidence(installation, phase, file);
      toast.success("Foto registrada.");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(null);
    }
  };
  return (
    <main className="mx-auto max-w-lg space-y-4 pb-12">
      <div className="flex items-center justify-between">
        <Link href="/instalacoes" className="text-sm text-primary underline">
          Voltar às instalações
        </Link>
        <Button
          size="icon"
          variant="ghost"
          onClick={load}
          aria-label="Atualizar"
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle>
              OS {installation.order?.sale_number ?? "—"}
              <span className="mt-1 block text-base font-normal">
                {installation.order?.client_name}
              </span>
            </CardTitle>
            <Badge>{INSTALLATION_STATUS_LABEL[installation.status]}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <strong>Data:</strong>{" "}
            {formatAgendaDate(installation.scheduled_start)}
          </p>
          <p>
            <strong>Equipe:</strong> {installation.team?.name ?? "Sem equipe"}
          </p>
          <p>
            <strong>Responsável:</strong>{" "}
            {installation.responsible?.name ||
              installation.responsible?.email ||
              "Não definido"}
          </p>
          <p>
            <strong>Veículo:</strong>{" "}
            {installation.vehicle_label || "Não definido"}
          </p>
          {installation.started_at && (
            <p>
              <strong>Iniciada:</strong>{" "}
              {formatAgendaDate(installation.started_at)}
            </p>
          )}
          <p>
            <MapPin className="mr-1 inline size-4" />
            {installation.address_snapshot}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild className="h-11" variant="outline">
              <a
                target="_blank"
                href={buildMapsUrl({
                  address: installation.address_snapshot,
                  lat: installation.address_lat,
                  lng: installation.address_lng,
                })}
              >
                Google Maps
              </a>
            </Button>
            <Button asChild className="h-11" variant="outline">
              <a
                target="_blank"
                href={buildWazeUrl({
                  address: installation.address_snapshot,
                  lat: installation.address_lat,
                  lng: installation.address_lng,
                })}
              >
                <Navigation className="mr-2 size-4" />
                Waze
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5">
          <InstallationChecklist
            title="Antes da instalação"
            items={pre}
            readOnly={installation.status !== "SCHEDULED"}
            savingItemId={savingChecklistItemId}
            onChange={updateChecklist}
          />
          {installation.status === "SCHEDULED" && (
            <>
              <div className="mt-4">
                <Button
                  className="h-12 w-full"
                  disabled={!preReady || busy || savingChecklistItemId !== null}
                  onClick={() => action("start")}
                >
                  Iniciar instalação
                </Button>
                {!preReady && (
                  <p className="mt-2 text-center text-sm text-muted-foreground">
                    Conclua os{" "}
                    {
                      pre.filter(i => i.is_required && i.status === "PENDING")
                        .length
                    }{" "}
                    itens obrigatórios.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Fotos antes</CardTitle>
          <p className="text-sm text-muted-foreground">
            Opcional, mas recomendado para registrar as condições do local.
          </p>
        </CardHeader>
        <CardContent>
          <InstallationPhotoUploader
            phase="BEFORE"
            uploading={uploading === "BEFORE"}
            disabled={readonly}
            onFile={f => upload("BEFORE", f)}
          />
        </CardContent>
      </Card>
      {installation.status !== "SCHEDULED" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Fotos durante</CardTitle>
              <p className="text-sm text-muted-foreground">
                Estrutura, fixação, elétrica, bastidores e condições
                encontradas.
              </p>
            </CardHeader>
            <CardContent>
              <InstallationPhotoUploader
                phase="DURING"
                uploading={uploading === "DURING"}
                disabled={readonly}
                onFile={f => upload("DURING", f)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Fotos depois</CardTitle>
              <p className="text-sm font-medium">
                Obrigatório: pelo menos 1 foto para concluir.{" "}
                {readiness.afterCount} registrada(s).
              </p>
            </CardHeader>
            <CardContent>
              <InstallationPhotoUploader
                phase="AFTER"
                uploading={uploading === "AFTER"}
                disabled={readonly}
                onFile={f => upload("AFTER", f)}
              />
            </CardContent>
          </Card>
        </>
      )}
      {evidence.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Galeria de evidências</CardTitle>
          </CardHeader>
          <CardContent>
            <InstallationEvidenceGallery evidence={evidence} />
          </CardContent>
        </Card>
      )}
      {installation.status !== "SCHEDULED" && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <InstallationChecklist
              title="Conferência final"
              items={completion}
              readOnly={installation.status !== "IN_PROGRESS"}
              savingItemId={savingChecklistItemId}
              onChange={updateChecklist}
            />
            <div>
              <Label htmlFor="completion-notes">Observações finais</Label>
              <Textarea
                id="completion-notes"
                maxLength={4000}
                disabled={readonly || savingNotes || !notesActiveInstallation}
                value={notesActiveInstallation ? notesDraft.text : ""}
                onChange={e => {
                  setNotesSaveError(null);
                  setNotesDraft(previous => editCompletionNotesDraft(previous, e.target.value));
                }}
                placeholder="Registre informações importantes sobre o serviço, condições encontradas ou orientações."
              />
              {notesDraft.changedRemotely && (
                <div role="alert" className="mt-2 space-y-2 rounded-lg border border-amber-300 p-3 text-sm">
                  <p>
                    As informações desta instalação mudaram enquanto você editava.
                    Seu texto foi preservado e não será enviado sobre uma versão mais recente.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={savingNotes}
                    onClick={() => {
                      setNotesDraft(previous => resetCompletionNotesToLatest(previous));
                      setNotesSaveError(null);
                    }}
                  >
                    Descartar meu texto e usar versão atual
                  </Button>
                </div>
              )}
              {notesSaveError && (
                <p role="alert" className="mt-2 text-sm text-destructive">{notesSaveError}</p>
              )}
              <Button
                type="button"
                variant="outline"
                className="mt-2"
                disabled={readonly || savingNotes || !notesActiveInstallation || !notesDirty || notesDraft.changedRemotely}
                onClick={async () => {
                  if (notesSavingRef.current || notesDraft.changedRemotely || !notesDraft.expectedUpdatedAt) return;
                  notesSavingRef.current = true;
                  setSavingNotes(true);
                  setNotesSaveError(null);
                  try {
                    const saved = await saveCompletionNotes(
                      installation.id,
                      notesDraft.text,
                      notesDraft.expectedUpdatedAt
                    );
                    setNotesDraft(freshCompletionNotesDraft(saved));
                    toast.success("Observações salvas.");
                    await load();
                  } catch (e) {
                    const message = e instanceof Error ? e.message : "Não foi possível salvar as observações.";
                    setNotesSaveError(message);
                    // On a stale version, refresh the baseline without discarding typed text.
                    await load();
                  } finally {
                    notesSavingRef.current = false;
                    setSavingNotes(false);
                  }
                }}
              >
                {savingNotes ? "Salvando…" : "Salvar observações"}
              </Button>
            </div>
            <InstallationCompletionReadiness {...readiness} />
            <Button
              className="h-12 w-full"
              disabled={!readiness.ready || busy || savingChecklistItemId !== null}
              onClick={() => action("complete")}
            >
              Concluir instalação
            </Button>
          </CardContent>
        </Card>
      )}
      {installation.status === "COMPLETED" && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="font-semibold text-emerald-700">
              Instalação concluída com sucesso.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline">
                <Link href={`/os/${installation.os_id}`}>Ver OS</Link>
              </Button>
              <Button asChild>
                <Link href="/instalacoes">Minhas instalações</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {hubPermissions.canManageInstallations &&
        ["SCHEDULED", "IN_PROGRESS"].includes(installation.status) && (
          <div className="border-t pt-4">
            <Button variant="ghost" size="sm" onClick={() => setOverride(true)}>
              Mais ações · Concluir excepcionalmente
            </Button>
          </div>
        )}
      <MutationInputDialog
        open={override}
        onOpenChange={setOverride}
        title="Concluir excepcionalmente"
        label="Esta ação ignora os requisitos normais da execução. Informe o motivo."
        required
        confirmLabel="Concluir excepcionalmente"
        onConfirm={async reason => {
          await forceCompleteInstallation(installation.id, reason);
          toast.success("Instalação concluída excepcionalmente.");
          await load();
        }}
      />
    </main>
  );
}
