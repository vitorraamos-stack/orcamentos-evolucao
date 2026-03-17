import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
          "relative flex min-w-[190px] cursor-pointer flex-col gap-1 p-3 transition-colors hover:bg-muted/40",
          count > 0 &&
            "border-orange-300 bg-orange-50 text-orange-950 animate-pulse [animation-duration:2.2s] motion-reduce:animate-none"
        )}
      >
        <span className="text-xs uppercase text-muted-foreground">
          Feedbacks Instalações
        </span>
        <div className="flex items-center justify-between">
          <span className="text-xl font-semibold">{count}</span>
          <Badge variant="outline">{count} itens</Badge>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[85vh] max-w-5xl p-4 sm:p-6">
          <div className="flex h-full flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold">Feedbacks Instalações</h3>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Fechar
              </Button>
            </div>
            <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[360px_minmax(0,1fr)]">
              <Card className="min-h-0 space-y-3 p-3">
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Buscar feedback"
                />
                <div className="min-h-0 space-y-2 overflow-y-auto">
                  {filtered.map(item => {
                    const selectedClass =
                      selected?.id === item.id ? "border-primary bg-primary/5" : "";
                    return (
                      <Card
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(item.id)}
                        className={`cursor-pointer space-y-2 p-3 ${selectedClass}`}
                      >
                        <p className="font-semibold">{getHeadline(item)}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {item.feedback}
                        </p>
                      </Card>
                    );
                  })}
                  {filtered.length === 0 ? (
                    <Card className="p-3 text-sm text-muted-foreground">
                      Nenhum feedback encontrado.
                    </Card>
                  ) : null}
                </div>
              </Card>

              <Card className="min-h-0 space-y-3 overflow-y-auto p-4">
                {selected ? (
                  <>
                    <h4 className="text-lg font-semibold">{getHeadline(selected)}</h4>
                    <p>
                      <strong>Cliente:</strong> {selected.client_name ?? "—"}
                    </p>
                    <p>
                      <strong>Origem:</strong> {selected.source_type}
                    </p>
                    <p>
                      <strong>Finalizado em:</strong>{" "}
                      {new Date(selected.finalized_at).toLocaleString("pt-BR")}
                    </p>
                    <p>
                      <strong>Status revisão:</strong>{" "}
                      {selected.reviewed ? "Revisado" : "Pendente"}
                    </p>
                    <Card className="bg-muted/20 p-3">
                      <p className="whitespace-pre-line text-sm">{selected.feedback}</p>
                    </Card>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Selecione um feedback para visualizar.
                  </p>
                )}
              </Card>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
