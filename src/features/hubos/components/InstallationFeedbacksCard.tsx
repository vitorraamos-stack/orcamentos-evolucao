import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { InstallationFeedback } from "@/features/hubos/types";
import { cn } from "@/lib/utils";

type Props = {
  items: InstallationFeedback[];
};

const getHeadline = (item: InstallationFeedback) => {
  const code = item.os_number ?? item.sale_number ?? "—";
  const title = item.title || item.client_name || "Sem título";
  return `${code} - ${title}`;
};

const formatFinalizedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
};

export default function InstallationFeedbacksCard({ items }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;

    return items.filter(item => {
      return (
        String(item.os_number ?? item.sale_number ?? "")
          .toLowerCase()
          .includes(term) ||
        (item.client_name ?? "").toLowerCase().includes(term) ||
        (item.title ?? "").toLowerCase().includes(term) ||
        item.feedback.toLowerCase().includes(term)
      );
    });
  }, [items, search]);

  const selected = useMemo(
    () => filtered.find(item => item.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  );

  const count = items.length;
  const pendingCount = items.filter(item => !item.reviewed).length;
  const reviewedCount = count - pendingCount;

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "relative flex min-w-[190px] cursor-pointer flex-col gap-1 p-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          pendingCount > 0 &&
            "border-orange-300 bg-orange-50 text-orange-950 animate-pulse [animation-duration:2.2s] motion-reduce:animate-none"
        )}
      >
        <span className="text-xs uppercase text-muted-foreground">
          Feedbacks Instalações
        </span>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xl font-semibold">{count}</span>
          <Badge variant="outline" className="shrink-0">
            {pendingCount} pendentes
          </Badge>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(85vh,760px)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 sm:h-[85vh] sm:max-h-[760px] sm:max-w-6xl">
          <div className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="border-b px-4 py-4 pr-12 text-left sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <DialogTitle>Feedbacks de instalações</DialogTitle>
                  <DialogDescription>
                    Acompanhe os relatos finais enviados pelo quiosque de
                    instalações.
                  </DialogDescription>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Badge variant="secondary">{count} no total</Badge>
                  <Badge variant={pendingCount > 0 ? "default" : "outline"}>
                    {pendingCount} pendentes
                  </Badge>
                  <Badge variant="outline">{reviewedCount} revisados</Badge>
                </div>
              </div>
            </DialogHeader>

            <div className="grid min-h-0 flex-1 grid-rows-[minmax(220px,0.95fr)_minmax(260px,1.05fr)] gap-0 md:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] md:grid-rows-1">
              <aside className="flex min-h-0 flex-col gap-3 border-b bg-muted/20 p-3 md:border-b-0 md:border-r sm:p-4">
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Buscar por OS, cliente ou feedback"
                  aria-label="Buscar feedbacks de instalações"
                  className="bg-background"
                />
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {filtered.map(item => {
                    const isSelected = selected?.id === item.id;
                    return (
                      <Card
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(item.id)}
                        onKeyDown={event => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedId(item.id);
                          }
                        }}
                        className={cn(
                          "cursor-pointer space-y-2 p-3 transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                          isSelected && "border-primary bg-background shadow-sm"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 break-words text-sm font-semibold leading-snug">
                            {getHeadline(item)}
                          </p>
                          <Badge
                            variant={item.reviewed ? "outline" : "secondary"}
                            className="shrink-0"
                          >
                            {item.reviewed ? "Revisado" : "Pendente"}
                          </Badge>
                        </div>
                        <p className="line-clamp-2 break-words text-xs text-muted-foreground">
                          {item.feedback}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatFinalizedAt(item.finalized_at)}
                        </p>
                      </Card>
                    );
                  })}
                  {filtered.length === 0 ? (
                    <Card className="p-4 text-sm text-muted-foreground">
                      Nenhum feedback encontrado para a busca atual.
                    </Card>
                  ) : null}
                </div>
              </aside>

              <section className="min-h-0 overflow-y-auto p-4 sm:p-6">
                {selected ? (
                  <article className="mx-auto flex max-w-3xl flex-col gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={selected.reviewed ? "outline" : "default"}
                        >
                          {selected.reviewed ? "Revisado" : "Revisão pendente"}
                        </Badge>
                        <Badge variant="outline">
                          Origem: {selected.source_type}
                        </Badge>
                      </div>
                      <h4 className="break-words text-2xl font-semibold tracking-tight">
                        {getHeadline(selected)}
                      </h4>
                    </div>

                    <dl className="grid gap-3 rounded-lg border bg-muted/10 p-4 text-sm sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-xs font-medium uppercase text-muted-foreground">
                          Cliente
                        </dt>
                        <dd className="break-words font-medium">
                          {selected.client_name ?? "—"}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-medium uppercase text-muted-foreground">
                          Finalizado em
                        </dt>
                        <dd className="font-medium">
                          {formatFinalizedAt(selected.finalized_at)}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-medium uppercase text-muted-foreground">
                          Revisado por
                        </dt>
                        <dd className="break-words font-medium">
                          {selected.reviewed_by_email ?? "—"}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-medium uppercase text-muted-foreground">
                          Revisado em
                        </dt>
                        <dd className="font-medium">
                          {selected.reviewed_at
                            ? formatFinalizedAt(selected.reviewed_at)
                            : "—"}
                        </dd>
                      </div>
                    </dl>

                    <Card className="bg-background p-4 shadow-sm">
                      <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                        Feedback enviado
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm leading-6">
                        {selected.feedback}
                      </p>
                    </Card>
                  </article>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Selecione um feedback para visualizar.
                  </div>
                )}
              </section>
            </div>

            <div className="flex justify-end border-t px-4 py-3 sm:px-6">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
