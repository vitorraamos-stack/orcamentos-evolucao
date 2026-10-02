import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  BadgeCheck,
  CalendarClock,
  CircleDollarSign,
  ExternalLink,
  FileText,
  RefreshCw,
  Search,
  UploadCloud,
  UserRoundCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchFinanceQueue,
  fetchPendingSecondInstallments,
  updateFinanceInstallment,
} from "@/features/hubos/finance";
import { uploadReceiptForOrder } from "@/features/hubos/assets";
import { useAuth } from "@/contexts/AuthContext";
import { labelFinanceStatus } from "@/lib/financeStatusLabels";
import {
  summarizeConsultantFinancePending,
  type ConsultantFinancePendingGroup,
} from "@/features/hubos/financePending";
import {
  formatDueDateStatus,
  getFinancePendingActionText,
  getLatestFinanceNote,
  isDueToday,
  isOverdueInstallment,
  parseFinanceNoteHistory,
  sortFinancePendingItems,
  type FinancePendingItem,
  type FinancePendingSortMode,
} from "./financePendingPresentation";
import { reconcilePendingSelection } from "./osPendentesSelection";

type Filter = "all" | ConsultantFinancePendingGroup;

const groupLabel: Record<ConsultantFinancePendingGroup, string> = {
  second_installment: "2ª Parcela",
  registration: "Cadastro Pendente",
  rejected: "Rejeitado",
};

const formatDate = (value?: string | null) =>
  value
    ? new Date(
        value.includes("T") ? value : `${value}T12:00:00`
      ).toLocaleDateString("pt-BR")
    : "—";

const formatFileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const noteHistory = (existing: string | null, status: string, note: string) =>
  [
    existing?.trim(),
    `[${new Date().toLocaleString("pt-BR")}] CONSULTOR • ${status}\n${note.trim()}`.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

const filterOptions: Array<{
  value: Filter;
  label: string;
  summaryKey:
    | "totalOrders"
    | "secondInstallments"
    | "registrationPending"
    | "rejected";
}> = [
  { value: "all", label: "Todas", summaryKey: "totalOrders" },
  {
    value: "second_installment",
    label: "2ª parcela",
    summaryKey: "secondInstallments",
  },
  {
    value: "registration",
    label: "Cadastro pendente",
    summaryKey: "registrationPending",
  },
  { value: "rejected", label: "Rejeitados", summaryKey: "rejected" },
];

export default function OsPendentesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<FinancePendingItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<FinancePendingSortMode>("priority");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedKeyRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectItem = useCallback((key: string | null) => {
    if (key === selectedKeyRef.current) return;
    selectedKeyRef.current = key;
    setSelectedKey(key);
    setFile(null);
    setNote("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const [second, registration, rejected] = await Promise.all([
        fetchPendingSecondInstallments(),
        fetchFinanceQueue(["CADASTRO_PENDENTE"]),
        fetchFinanceQueue(["REJEITADO"]),
      ]);
      const next: FinancePendingItem[] = [
        ...second.map(value => ({
          key: `second:${value.id}`,
          group: "second_installment" as const,
          value,
        })),
        ...registration.map(value => ({
          key: `registration:${value.id}`,
          group: "registration" as const,
          value,
        })),
        ...rejected.map(value => ({
          key: `rejected:${value.id}`,
          group: "rejected" as const,
          value,
        })),
      ];
      setItems(next);
      setLoadError(false);
      setLastUpdatedAt(new Date());
      const priorityKeys = sortFinancePendingItems(next, "priority").map(
        item => item.key
      );
      selectItem(
        reconcilePendingSelection(selectedKeyRef.current, priorityKeys)
      );
    } catch (error) {
      setLoadError(true);
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as pendências."
      );
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [selectItem]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = summarizeConsultantFinancePending(
    items.map(({ value }) => value)
  );
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const filtered = items.filter(
      item =>
        (filter === "all" || item.group === filter) &&
        (!term ||
          [
            item.value.os_orders?.sale_number,
            item.value.os_orders?.client_name,
          ].some(value =>
            String(value ?? "")
              .toLocaleLowerCase("pt-BR")
              .includes(term)
          ))
    );
    return sortFinancePendingItems(filtered, sortMode);
  }, [items, filter, search, sortMode]);

  useEffect(() => {
    const nextKey = reconcilePendingSelection(
      selectedKey,
      visible.map(item => item.key)
    );
    selectItem(nextKey);
  }, [selectedKey, selectItem, visible]);

  const selected = visible.find(item => item.key === selectedKey) ?? null;

  const clearViewFilters = () => {
    setFilter("all");
    setSearch("");
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const upload = async () => {
    if (
      !selected ||
      selected.group !== "second_installment" ||
      !selected.value.os_orders?.id ||
      !file ||
      busy
    )
      return;
    setBusy(true);
    try {
      await uploadReceiptForOrder({
        osId: selected.value.os_orders.id,
        file,
        userId: user?.id ?? null,
        installmentLabel: "2/2",
      });
      toast.success("Comprovante enviado ao Financeiro.");
      removeFile();
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao anexar comprovante 2/2."
      );
    } finally {
      setBusy(false);
    }
  };

  const returnToFinance = async () => {
    if (
      !selected ||
      (selected.group !== "registration" && selected.group !== "rejected") ||
      busy
    )
      return;
    setBusy(true);
    const group = selected.group;
    const label =
      group === "registration" ? "Cadastro corrigido" : "Ajuste concluído";
    try {
      await updateFinanceInstallment({
        id: selected.value.id,
        status: "PENDING_REVIEW",
        notes: noteHistory(selected.value.notes, label, note),
        reviewedBy: user?.id ?? null,
      });
      toast.success(
        group === "registration"
          ? "Cadastro reenviado para conferência."
          : "Ajuste reenviado para o Financeiro."
      );
      setNote("");
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível reenviar ao Financeiro."
      );
    } finally {
      setBusy(false);
    }
  };

  const updatedLabel = lastUpdatedAt
    ? `Atualizado às ${lastUpdatedAt.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : null;

  return (
    <div className="space-y-4">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold">Pendências Financeiras</h1>
          <p className="text-sm text-muted-foreground">
            Pendências que precisam de ação do Comercial antes de retornar ao
            Financeiro.
          </p>
        </div>
        <div className="flex items-center gap-3 sm:justify-end">
          {updatedLabel && (
            <span className="text-xs text-muted-foreground">
              {updatedLabel}
            </span>
          )}
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
        </div>
      </header>

      {loading && items.length === 0 ? (
        <LoadingState />
      ) : loadError && items.length === 0 ? (
        <Card className="mx-auto max-w-xl">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <div>
              <h2 className="font-semibold">
                Não foi possível carregar as pendências financeiras.
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Verifique sua conexão e tente novamente.
              </p>
            </div>
            <Button onClick={() => void load()}>Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : summary.totalOrders === 0 ? (
        <Card className="mx-auto max-w-2xl border-dashed">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <BadgeCheck className="mb-4 h-12 w-12 text-emerald-600" />
            <h2 className="text-lg font-semibold">
              Nenhuma pendência financeira
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              O Comercial não possui nenhuma ação financeira pendente neste
              momento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <SummaryCards
            filter={filter}
            summary={summary}
            busy={busy}
            onFilter={setFilter}
          />
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_10rem]">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Buscar por OS ou cliente..."
                      value={search}
                      disabled={busy}
                      onChange={event => setSearch(event.target.value)}
                    />
                  </div>
                  <Select
                    value={sortMode}
                    disabled={busy}
                    onValueChange={value =>
                      setSortMode(value as FinancePendingSortMode)
                    }
                  >
                    <SelectTrigger className="w-full" aria-label="Ordenar por">
                      <SelectValue placeholder="Ordenar por" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priority">Prioridade</SelectItem>
                      <SelectItem value="oldest">Mais antigas</SelectItem>
                      <SelectItem value="newest">Mais recentes</SelectItem>
                      <SelectItem value="due_date">Vencimento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div
                  className="flex flex-wrap gap-1.5"
                  aria-label="Filtros rápidos"
                >
                  {filterOptions.map(option => (
                    <Button
                      key={option.value}
                      size="sm"
                      variant={filter === option.value ? "default" : "outline"}
                      disabled={busy}
                      onClick={() => setFilter(option.value)}
                    >
                      {option.label}
                      <Badge
                        variant="secondary"
                        className="ml-2 min-w-5 justify-center px-1"
                      >
                        {summary[option.summaryKey]}
                      </Badge>
                    </Button>
                  ))}
                </div>
                <div className="max-h-[calc(100vh-20rem)] min-h-52 space-y-2 overflow-y-auto pr-1">
                  {visible.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-10 text-center">
                      <p className="text-sm text-muted-foreground">
                        Nenhuma pendência encontrada para este filtro.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearViewFilters}
                      >
                        Limpar busca e filtros
                      </Button>
                    </div>
                  ) : (
                    visible.map(item => (
                      <QueueItem
                        key={item.key}
                        item={item}
                        selected={selectedKey === item.key}
                        busy={busy}
                        onSelect={selectItem}
                      />
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {selected ? (
              <PendingDetail
                key={selected.key}
                item={selected}
                file={file}
                note={note}
                busy={busy}
                fileInputRef={fileInputRef}
                onFile={setFile}
                onRemoveFile={removeFile}
                onNote={setNote}
                onUpload={upload}
                onReturn={returnToFinance}
              />
            ) : (
              <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                Ajuste a busca ou os filtros para selecionar uma pendência.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(item => (
          <Skeleton key={item} className="h-20" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-36 w-full" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function SummaryCards({
  filter,
  summary,
  busy,
  onFilter,
}: {
  filter: Filter;
  summary: ReturnType<typeof summarizeConsultantFinancePending>;
  busy: boolean;
  onFilter: (filter: Filter) => void;
}) {
  const cards = [
    {
      value: "all" as const,
      label: "Pendências",
      count: summary.totalOrders,
      icon: CircleDollarSign,
      tone: "text-primary",
    },
    {
      value: "second_installment" as const,
      label: "2ª parcela",
      count: summary.secondInstallments,
      icon: CalendarClock,
      tone: "text-blue-600",
    },
    {
      value: "registration" as const,
      label: "Cadastro pendente",
      count: summary.registrationPending,
      icon: UserRoundCheck,
      tone: "text-amber-600",
    },
    {
      value: "rejected" as const,
      label: "Rejeitados",
      count: summary.rejected,
      icon: AlertCircle,
      tone: "text-destructive",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <button
            type="button"
            key={card.value}
            disabled={busy}
            aria-pressed={filter === card.value}
            onClick={() => onFilter(card.value)}
            className={`flex h-20 items-center justify-between rounded-xl border bg-card px-4 text-left shadow-sm transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${filter === card.value ? "border-primary bg-primary/5 ring-1 ring-primary/20" : ""}`}
          >
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon
                className={`h-4 w-4 ${card.count ? card.tone : "text-muted-foreground"}`}
              />
              {card.label}
            </span>
            <strong className="text-2xl tabular-nums">{card.count}</strong>
          </button>
        );
      })}
    </div>
  );
}

function QueueItem({
  item,
  selected,
  busy,
  onSelect,
}: {
  item: FinancePendingItem;
  selected: boolean;
  busy: boolean;
  onSelect: (key: string) => void;
}) {
  const overdue = isOverdueInstallment(item);
  const dueToday = isDueToday(item);
  const accent =
    item.group === "rejected" || overdue
      ? "border-l-destructive"
      : dueToday || item.group === "registration"
        ? "border-l-amber-500"
        : "border-l-blue-500";
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onSelect(item.key)}
      className={`w-full rounded-lg border border-l-4 p-3 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${accent} ${selected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <strong>OS #{item.value.os_orders?.sale_number ?? "—"}</strong>
          <p className="truncate text-sm">
            {item.value.os_orders?.client_name ?? "Sem cliente"}
          </p>
        </div>
        <Badge
          variant={item.group === "rejected" ? "destructive" : "secondary"}
        >
          {groupLabel[item.group]}
        </Badge>
      </div>
      <p className="mt-2 text-sm font-medium">
        {getFinancePendingActionText(item.group)}
      </p>
      {formatDueDateStatus(item) && (
        <p
          className={`mt-1 text-xs ${overdue || dueToday ? "font-medium text-destructive" : "text-muted-foreground"}`}
        >
          {formatDueDateStatus(item)}
        </p>
      )}
    </button>
  );
}

function PendingDetail({
  item,
  file,
  note,
  busy,
  fileInputRef,
  onFile,
  onRemoveFile,
  onNote,
  onUpload,
  onReturn,
}: {
  item: FinancePendingItem;
  file: File | null;
  note: string;
  busy: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File | null) => void;
  onRemoveFile: () => void;
  onNote: (note: string) => void;
  onUpload: () => Promise<void>;
  onReturn: () => Promise<void>;
}) {
  const parsedHistory = parseFinanceNoteHistory(item.value.notes);
  const overdue = isOverdueInstallment(item);
  const dueToday = isDueToday(item);
  const actionCopy =
    item.group === "second_installment"
      ? "Envie o comprovante da 2ª parcela para conferência do Financeiro."
      : item.group === "registration"
        ? "Revise e corrija os dados solicitados pelo Financeiro e depois reenvie para conferência."
        : "Corrija o motivo informado pelo Financeiro antes de reenviar esta solicitação.";
  const acceptFile = (candidate?: File) => {
    if (!candidate || busy) return;
    if (
      candidate.type === "application/pdf" ||
      candidate.type.startsWith("image/")
    )
      onFile(candidate);
  };
  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">
                OS #{item.value.os_orders?.sale_number ?? "—"}
              </h2>
              <Badge
                variant={
                  item.group === "rejected" ? "destructive" : "secondary"
                }
              >
                {groupLabel[item.group]}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {item.value.os_orders?.client_name ?? "Sem cliente"}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/os/${item.value.os_id}`}>
              Abrir OS <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Tipo</dt>
            <dd className="font-medium">{groupLabel[item.group]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Parcela</dt>
            <dd className="font-medium">
              {item.value.installment_no}/{item.value.total_installments}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Vencimento</dt>
            <dd className="font-medium">{formatDate(item.value.due_date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="font-medium">
              {labelFinanceStatus(item.value.status)}
            </dd>
          </div>
        </dl>
        <section
          className={`rounded-lg border p-4 ${item.group === "rejected" ? "border-destructive/30 bg-destructive/5" : ""}`}
        >
          <h3 className="text-sm font-semibold">O que precisa ser feito</h3>
          <p className="mt-1 text-sm text-muted-foreground">{actionCopy}</p>
          {overdue && (
            <p className="mt-2 flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4" />
              Esta parcela está vencida.
            </p>
          )}
          {dueToday && (
            <p className="mt-2 flex items-center gap-2 text-sm font-medium text-amber-700">
              <CalendarClock className="h-4 w-4" />
              Vencimento hoje.
            </p>
          )}
        </section>
        {item.group === "rejected" && (
          <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <h3 className="text-xs font-bold tracking-wide text-destructive">
              MOTIVO DA REJEIÇÃO
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {getLatestFinanceNote(item.value.notes) ??
                "Consulte o histórico da solicitação."}
            </p>
          </section>
        )}
        {item.value.notes && (
          <FinanceTimeline
            history={parsedHistory}
            title={
              item.group === "registration"
                ? "Solicitação do Financeiro"
                : "Histórico"
            }
          />
        )}
        {item.group === "second_installment" && (
          <section className="space-y-3 border-t pt-4">
            <input
              ref={fileInputRef}
              key={item.key}
              id={`proof-${item.key}`}
              className="sr-only"
              type="file"
              disabled={busy}
              accept="image/*,application/pdf"
              onChange={event => acceptFile(event.target.files?.[0])}
            />
            <Label
              htmlFor={`proof-${item.key}`}
              className={`flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-5 text-center transition hover:bg-muted/40 ${busy ? "pointer-events-none opacity-60" : ""}`}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                acceptFile(event.dataTransfer.files?.[0]);
              }}
            >
              <UploadCloud className="mb-2 h-7 w-7 text-primary" />
              <span className="font-medium">Arraste o comprovante aqui</span>
              <span className="text-sm text-muted-foreground">
                ou clique para selecionar
              </span>
              <span className="mt-2 text-xs text-muted-foreground">
                PDF, JPG ou PNG
              </span>
            </Label>
            {file && (
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <FileText className="h-5 w-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={onRemoveFile}
                >
                  <X className="mr-1 h-4 w-4" />
                  Remover
                </Button>
              </div>
            )}
            <Button
              className="w-full sm:w-auto"
              disabled={!file || busy}
              onClick={() => void onUpload()}
            >
              {busy ? "Enviando..." : "Enviar comprovante ao Financeiro"}
            </Button>
          </section>
        )}
        {(item.group === "registration" || item.group === "rejected") && (
          <section className="space-y-3 border-t pt-4">
            <div>
              <Label htmlFor={`note-${item.key}`}>
                {item.group === "registration"
                  ? "Observação da correção (opcional)"
                  : "Descrição do ajuste realizado (recomendado)"}
              </Label>
              <Textarea
                id={`note-${item.key}`}
                className="mt-2"
                value={note}
                disabled={busy}
                onChange={event => onNote(event.target.value)}
                placeholder={
                  item.group === "registration"
                    ? "Descreva brevemente a correção realizada."
                    : "Descreva o ajuste realizado"
                }
              />
            </div>
            <Button
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={() => void onReturn()}
            >
              {busy
                ? "Enviando..."
                : item.group === "registration"
                  ? "Cadastro corrigido → Reenviar ao Financeiro"
                  : "Ajuste concluído → Reenviar ao Financeiro"}
            </Button>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function FinanceTimeline({
  history,
  title,
}: {
  history: ReturnType<typeof parseFinanceNoteHistory>;
  title: string;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      {history.fallback ? (
        <div className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">
          {history.fallback}
        </div>
      ) : (
        <ol className="mt-3 space-y-0">
          {history.entries.map((entry, index) => (
            <li
              key={`${entry.header}-${index}`}
              className="relative border-l pb-4 pl-5 last:border-transparent last:pb-0"
            >
              <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
              <time className="text-xs text-muted-foreground">
                {entry.timestamp}
              </time>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {entry.actor}
                </Badge>
                <span className="text-xs font-medium">{entry.status}</span>
              </div>
              {entry.body && (
                <p className="mt-1 whitespace-pre-wrap text-sm">{entry.body}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
