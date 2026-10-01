import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { PackageCheck, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { updateOrderInsumos } from "@/features/hubos/api";
import type { OsOrder } from "@/features/hubos/types";
import { calculateOrderRisk } from "@/modules/orders/risk";
import { OrderRiskBadge } from "@/shared/components/OrderBadges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listAwaitingSuppliesOrders } from "../repositories/suppliesRepository";

const date = (value?: string | null) =>
  value
    ? new Date(
        value.includes("T") ? value : `${value}T12:00:00`
      ).toLocaleDateString("pt-BR")
    : "—";
const waiting = (value?: string | null) => {
  if (!value) return "Data não informada";
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86400000)
  );
  return days === 0 ? "Hoje" : `${days} ${days === 1 ? "dia" : "dias"}`;
};
const urgent = (order: OsOrder) =>
  order.is_urgent || order.art_direction_tag === "URGENTE";

export default function AwaitingSuppliesPage() {
  const { hubPermissions } = useAuth();
  const [orders, setOrders] = useState<OsOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const next = await listAwaitingSuppliesOrders();
      setOrders(next);
      setSelectedId(current =>
        next.some(item => item.id === current) ? current : (next[0]?.id ?? null)
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os insumos."
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return orders;
    return orders.filter(order =>
      [
        order.sale_number,
        order.os_number,
        order.client_name,
        order.title,
        order.insumos_details,
      ].some(value =>
        String(value ?? "")
          .toLocaleLowerCase("pt-BR")
          .includes(term)
      )
    );
  }, [orders, search]);
  const selected = orders.find(order => order.id === selectedId) ?? null;
  const critical = orders.filter(
    order => calculateOrderRisk(order) === "CRITICO"
  ).length;
  const urgents = orders.filter(urgent).length;

  const resolve = async () => {
    if (!selected || notes.trim().length < 3 || resolvingId) return;
    setResolvingId(selected.id);
    try {
      await updateOrderInsumos(selected.id, "RESOLVE", notes.trim());
      toast.success("Insumo resolvido. OS retornada para Produção.");
      setDialogOpen(false);
      setNotes("");
      await load(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível resolver o insumo."
      );
    } finally {
      setResolvingId(null);
    }
  };

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[32rem]" />
          <Skeleton className="h-[32rem]" />
        </div>
      </div>
    );
  return (
    <div className="space-y-4">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold">Aguardando Insumos</h1>
          <p className="text-sm text-muted-foreground">
            Ordens de Serviço paradas por falta de material ou insumo.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button asChild variant="outline">
            <Link href="/os/producao/insumos">Ver quadro de Produção</Link>
          </Button>
        </div>
      </header>
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Aguardando", orders.length],
          ["Críticas", critical],
          ["Urgentes", urgents],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {orders.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-80 flex-col items-center justify-center text-center">
            <PackageCheck className="mb-3 h-10 w-10 text-emerald-600" />
            <h2 className="font-semibold">Nenhuma OS aguardando insumos.</h2>
            <p className="text-sm text-muted-foreground">
              A Produção não possui pendências de material neste momento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por OS, cliente ou material..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-[65vh] space-y-2 overflow-auto">
                {filtered.map(order => (
                  <button
                    type="button"
                    key={order.id}
                    onClick={() => setSelectedId(order.id)}
                    className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted/40 ${selectedId === order.id ? "border-primary bg-primary/5" : ""}`}
                  >
                    <div className="flex justify-between gap-2">
                      <strong>OS #{order.sale_number}</strong>
                      <OrderRiskBadge risk={calculateOrderRisk(order)} />
                    </div>
                    <p className="text-sm">{order.client_name}</p>
                    <p className="line-clamp-2 text-sm text-amber-800">
                      {order.insumos_details || "Material não detalhado"}
                    </p>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>Prazo: {date(order.delivery_date)}</span>
                      <span>
                        Aguardando: {waiting(order.insumos_requested_at)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-5 p-5">
              {selected && (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xl font-semibold">
                        OS #{selected.sale_number}
                      </p>
                      <p className="text-muted-foreground">
                        {selected.client_name}
                      </p>
                    </div>
                    <OrderRiskBadge risk={calculateOrderRisk(selected)} />
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Serviço</dt>
                      <dd>{selected.title || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Etapa atual</dt>
                      <dd>{selected.prod_status || selected.art_status}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Prazo</dt>
                      <dd>{date(selected.delivery_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Urgência</dt>
                      <dd>{urgent(selected) ? "Urgente" : "Normal"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Logística</dt>
                      <dd className="capitalize">{selected.logistic_type}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Solicitado em</dt>
                      <dd>{date(selected.insumos_requested_at)}</dd>
                    </div>
                  </dl>
                  <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <h2 className="text-sm font-semibold text-amber-900">
                      MATERIAL NECESSÁRIO
                    </h2>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-amber-950">
                      {selected.insumos_details || "Material não detalhado."}
                    </p>
                  </section>
                  {selected.insumos_return_notes && (
                    <section>
                      <h2 className="text-sm font-semibold">
                        Histórico de insumos
                      </h2>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {selected.insumos_return_notes}
                      </p>
                      {selected.insumos_resolved_at && (
                        <p className="mt-1 text-xs">
                          Resolvido em {date(selected.insumos_resolved_at)}
                        </p>
                      )}
                    </section>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <Link href={`/os/${selected.id}`}>Abrir OS</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href="/os/producao/insumos">Ver no quadro</Link>
                    </Button>
                    {hubPermissions.canMoveProducaoBoard && (
                      <Button
                        variant="secondary"
                        onClick={() => setDialogOpen(true)}
                      >
                        Insumo resolvido / Retornar para Produção
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Insumo resolvido</DialogTitle>
            <DialogDescription>
              Confirme como o material foi disponibilizado antes de retornar a
              OS para Produção.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-sm font-medium">
            Como o insumo foi resolvido?
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Informe a resolução (mínimo 3 caracteres)"
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={notes.trim().length < 3 || Boolean(resolvingId)}
              onClick={() => void resolve()}
            >
              {resolvingId ? "Resolvendo..." : "Confirmar resolução"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
