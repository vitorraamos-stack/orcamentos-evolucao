import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FileText,
  RefreshCw,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { quoteRepository } from "../repositories/quoteRepository";
import type { QuoteListItem, QuoteStatus } from "@shared/quotes";

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "Rascunho",
  SENT: "Enviado",
  ACCEPTED: "Aceito",
  REJECTED: "Recusado",
  CANCELLED: "Cancelado",
};

const statusVariant = (status: QuoteStatus) => {
  if (status === "ACCEPTED") return "default" as const;
  if (status === "REJECTED" || status === "CANCELLED")
    return "destructive" as const;
  return "secondary" as const;
};

const formatBrl = (amount: string) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(amount));

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

export default function QuotesCentralPage() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<QuoteListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<QuoteStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestGeneration = useRef(0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statusFilter = useMemo(
    () => (status === "all" ? null : status),
    [status]
  );

  const load = () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError("");
    quoteRepository
      .list({
        page,
        pageSize: PAGE_SIZE,
        search: search || null,
        status: statusFilter,
      })
      .then(result => {
        if (generation !== requestGeneration.current) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch(reason => {
        if (generation !== requestGeneration.current) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Falha ao carregar os orçamentos."
        );
      })
      .finally(() => {
        if (generation === requestGeneration.current) setLoading(false);
      });
  };

  useEffect(load, [page, search, statusFilter]);

  const submitSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const changeStatus = (value: string) => {
    setPage(1);
    setStatus(value as QuoteStatus | "all");
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Comercial</p>
          <h1 className="text-3xl font-bold tracking-tight">Orçamentos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulte, reabra e acompanhe os orçamentos oficiais da equipe.
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() => setLocation("/orcamentista")}
        >
          <FilePlus2 className="h-4 w-4" />
          Novo orçamento
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 lg:flex-row lg:items-center">
        <div className="flex flex-1 gap-2">
          <Input
            value={searchInput}
            placeholder="Número, cliente, telefone ou título"
            onChange={event => setSearchInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") submitSearch();
            }}
          />
          <Button
            variant="outline"
            className="gap-2"
            onClick={submitSearch}
          >
            <Search className="h-4 w-4" />
            Buscar
          </Button>
        </div>

        <Select value={status} onValueChange={changeStatus}>
          <SelectTrigger className="w-full lg:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="DRAFT">Rascunho</SelectItem>
            <SelectItem value="SENT">Enviado</SelectItem>
            <SelectItem value="ACCEPTED">Aceito</SelectItem>
            <SelectItem value="REJECTED">Recusado</SelectItem>
            <SelectItem value="CANCELLED">Cancelado</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Atualizar orçamentos"
          disabled={loading}
          onClick={load}
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
          <p className="font-medium">Não foi possível carregar os orçamentos.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4" onClick={load}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Nº</TableHead>
                <TableHead>Cliente / referência</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Atualizado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                    Carregando orçamentos...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <p className="font-medium">Nenhum orçamento encontrado.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Crie um novo orçamento ou ajuste os filtros.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                items.map(item => (
                  <TableRow
                    key={item.quoteId}
                    className="cursor-pointer"
                    onClick={() =>
                      setLocation(`/orcamentista?quote=${item.quoteId}`)
                    }
                  >
                    <TableCell className="font-semibold">
                      #{item.quoteNumber}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{item.commercial.customerName}</p>
                      <p className="max-w-[360px] truncate text-xs text-muted-foreground">
                        {item.commercial.title}
                        {item.commercial.customerPhone
                          ? ` · ${item.commercial.customerPhone}`
                          : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        Snapshot v{item.snapshotVersion} · {item.installments}x
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(item.status)}>
                        {STATUS_LABEL[item.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatBrl(item.totalSellingPrice.amount)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.createdByEmail ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(item.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        onClick={event => {
                          event.stopPropagation();
                          setLocation(
                            `/orcamentos/${item.quoteId}/proposta`
                          );
                        }}
                      >
                        <FileText className="h-4 w-4" />
                        Proposta
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {total} {total === 1 ? "orçamento" : "orçamentos"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage(current => Math.max(1, current - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Anterior
              </Button>
              <span className="text-sm">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() =>
                  setPage(current => Math.min(totalPages, current + 1))
                }
              >
                Próxima
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
