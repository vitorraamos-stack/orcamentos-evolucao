
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock3,
  Droplets, History, Layers, Loader2, Printer, RefreshCw, Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import {
  loadPrintStock, recordPrint, searchPrintOrders,
  type PrintOrderSuggestion,
} from "../repository";
import { decimal, estimatePrint, type InkBalance, type PrintRoll, type StockEvent } from "../model";
import { PrintingStockPanel } from "../components/PrintingStockPanel";
import { PrintingHistoryPanel } from "../components/PrintingHistoryPanel";

const fmt = (value: number, digits = 2) => value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const errorText = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";
export type RunInventoryOperation = (key: string, payload: unknown, work: (requestId: string) => Promise<void>, success: () => void) => Promise<void>;

type CompletedPrint = { os: string; rollId: string; rollCode: string; consumed: number };

export default function PrintingInventoryPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"prints" | "stock">("prints");
  const [stockTab, setStockTab] = useState<"rolls" | "inks">("rolls");
  const [rollFilter, setRollFilter] = useState<"all" | "available" | "low" | "empty" | "archived">("all");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rolls, setRolls] = useState<PrintRoll[]>([]);
  const [inks, setInks] = useState<InkBalance[]>([]);
  const [events, setEvents] = useState<StockEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const attempts = useRef<Record<string, { id: string; payload: string }>>({});
  const refreshVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    const data = await loadPrintStock();
    if (version !== refreshVersion.current) return;
    setRolls(data.rolls);
    setInks(data.inks);
    setEvents(data.events);
    setLastUpdated(new Date());
    setLoadError("");
  }, []);

  useEffect(() => {
    let mounted = true;
    void refresh().catch(error => {
      if (mounted) setLoadError(errorText(error));
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; refreshVersion.current++; };
  }, [refresh]);

  const manualRefresh = async () => {
    setRefreshing(true);
    try { await refresh(); toast.success("Estoque atualizado."); }
    catch (error) { toast.error(errorText(error)); }
    finally { setRefreshing(false); }
  };

  const execute: RunInventoryOperation = async (key, payload, work, success) => {
    if (busy) return;
    const fingerprint = JSON.stringify(payload);
    const existing = attempts.current[key];
    const requestId = existing?.payload === fingerprint ? existing.id : crypto.randomUUID();
    attempts.current[key] = { id: requestId, payload: fingerprint };
    setBusy(true);
    try {
      await work(requestId);
      delete attempts.current[key];
      success();
      try { await refresh(); }
      catch { toast.warning("Registro salvo, mas a tela não foi atualizada. Use Atualizar para conferir o saldo."); }
    } catch (error) {
      toast.error(errorText(error));
    } finally { setBusy(false); }
  };

  const [os, setOs] = useState("");
  const [suggestions, setSuggestions] = useState<PrintOrderSuggestion[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PrintOrderSuggestion | null>(null);
  const [manualOrder, setManualOrder] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchFailure, setSearchFailure] = useState(false);
  const [material, setMaterial] = useState("");
  const [rollId, setRollId] = useState("");
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [copies, setCopies] = useState("1");
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [wasteEnabled, setWasteEnabled] = useState(false);
  const [waste, setWaste] = useState("0");
  const [reprint, setReprint] = useState(false);
  const [reason, setReason] = useState("");
  const [completed, setCompleted] = useState<CompletedPrint | null>(null);

  useEffect(() => {
    if (selectedOrder?.sale_number === os || manualOrder || os.trim().length < 2 || completed) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchPrintOrders(os).then(results => {
        if (!cancelled) { setSuggestions(results); setSearchFailure(false); }
      }).catch(() => {
        if (!cancelled) { setSuggestions([]); setSearchFailure(true); }
      }).finally(() => { if (!cancelled) setSearching(false); });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [os, selectedOrder, manualOrder, completed]);

  const materials = useMemo(() => Array.from(new Set(rolls.filter(roll => !roll.archived_at).map(roll => roll.material))).sort((a,b) => a.localeCompare(b,"pt-BR")), [rolls]);
  const chosenMaterial = materials.includes(material) ? material : (materials[0] ?? "");
  const candidates = rolls.filter(roll => !roll.archived_at && roll.material === chosenMaterial);
  const selectedRoll = candidates.find(roll => roll.id === rollId);
  const validDimensions = [decimal(width), decimal(length), decimal(copies)].every(Number.isFinite) &&
    decimal(width) > 0 && decimal(length) > 0 && Number.isInteger(decimal(copies)) &&
    decimal(copies) >= 1 && decimal(copies) <= 10000;
  const validWaste = !wasteEnabled || (waste.trim() !== "" && Number.isFinite(decimal(waste)) && decimal(waste) >= 0);
  const consumption = validDimensions && validWaste
    ? Math.round((decimal(length) * decimal(copies) + (wasteEnabled ? decimal(waste) : 0)) * 100) / 10000 : null;
  const compatibility = (roll: PrintRoll) => {
    if (Number(roll.remaining_length_m) <= 0) return "Bobina esgotada";
    if (!validDimensions || !validWaste || consumption === null) return "";
    if (decimal(width) > Number(roll.width_cm)) return "Largura insuficiente";
    if (consumption > Number(roll.remaining_length_m) + 0.000001) return "Saldo insuficiente";
    return "";
  };
  const selectedIssue = selectedRoll ? compatibility(selectedRoll) : "";
  let estimate: number | null = null;
  if (selectedRoll && validDimensions && validWaste) {
    try { estimate = estimatePrint(selectedRoll, decimal(width), decimal(length), decimal(copies), wasteEnabled ? decimal(waste) : 0); }
    catch { /* Specific compatibility feedback is shown beside the selected roll. */ }
  }
  const orderReady = Boolean((selectedOrder?.sale_number === os || manualOrder) && os.trim());
  const reasonReady = !reprint || Boolean(reason.trim());
  const canConfirm = !busy && !completed && orderReady && estimate !== null && reasonReady && !searching;
  const availableCount = rolls.filter(roll => !roll.archived_at && Number(roll.remaining_length_m) > 0).length;
  const lowCount = rolls.filter(roll => !roll.archived_at && Number(roll.remaining_length_m) > 0 && Number(roll.remaining_length_m) <= 10).length;
  const inkLiters = inks.reduce((sum, ink) => sum + Number(ink.balance_ml), 0) / 1000;

  const startNext = (sameOrder: boolean) => {
    const prev = completed;
    setCompleted(null);
    setWidth(""); setLength(""); setCopies("1");
    setWasteEnabled(false); setWaste("0"); setReprint(false); setReason(""); setExtrasOpen(false);
    if (!sameOrder) {
      setOs(""); setSelectedOrder(null); setManualOrder(false);
      setMaterial(""); setRollId(""); setSuggestions([]);
    } else if (prev && prev.rollId !== rollId) {
      setRollId(prev.rollId);
    }
  };

  const openStock = (next: "rolls" | "inks", filter: typeof rollFilter = "all") => {
    setHistoryOpen(false); setStockTab(next); setRollFilter(filter); setTab("stock");
  };

  if (loading) return <div role="status" className="flex min-h-64 items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando impressão e estoque...</div>;
  if (loadError && !lastUpdated) return <div role="alert" className="mx-auto max-w-lg space-y-3 rounded-xl border p-6 text-center">
    <AlertCircle className="mx-auto h-7 w-7 text-destructive" />
    <h2 className="font-semibold">Não foi possível carregar o estoque</h2>
    <p className="text-sm text-muted-foreground">{loadError}</p>
    <Button onClick={() => void manualRefresh()}>Tentar novamente</Button>
  </div>;

  return (
    <div className="space-y-5 pb-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Impressão & Estoque</h1>
          <p className="mt-1 text-sm text-muted-foreground">Controle de materiais e movimentações da produção.</p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && <span className="hidden text-xs text-muted-foreground sm:inline">Atualizado às {lastUpdated.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span>}
          <Button variant="outline" size="sm" disabled={busy || refreshing} onClick={() => void manualRefresh()}>
            <RefreshCw className={"mr-2 h-4 w-4 " + (refreshing ? "animate-spin" : "")} /> Atualizar
          </Button>
        </div>
      </header>
      <nav aria-label="Áreas de impressão e estoque" className="flex gap-2 border-b pb-3">
        <Button aria-current={!historyOpen && tab === "prints" ? "page" : undefined} variant={!historyOpen && tab === "prints" ? "default" : "ghost"} onClick={() => { setHistoryOpen(false); setTab("prints"); }}>
          <Printer className="mr-2 h-4 w-4" /> Impressões
        </Button>
        <Button aria-current={!historyOpen && tab === "stock" ? "page" : undefined} variant={!historyOpen && tab === "stock" ? "default" : "ghost"} onClick={() => { setHistoryOpen(false); setTab("stock"); }}>
          <Layers className="mr-2 h-4 w-4" /> Estoque
        </Button>
      </nav>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric icon={<Printer className="h-5 w-5" />} value={String(availableCount)} label="Bobinas disponíveis" onClick={() => openStock("rolls", "available")} />
        <Metric icon={<AlertTriangle className="h-5 w-5 text-amber-600" />} value={String(lowCount)} label="Estoque baixo (até 10 m)" onClick={() => openStock("rolls", "low")} />
        <Metric icon={<Droplets className="h-5 w-5" />} value={fmt(inkLiters,1) + " L"} label="Tintas disponíveis" onClick={() => openStock("inks")} />
      </div>
      {historyOpen ? (
        <PrintingHistoryPanel rolls={rolls} onBack={() => setHistoryOpen(false)} />
      ) : tab === "stock" ? (
        <PrintingStockPanel
          rolls={rolls} inks={inks} busy={busy} execute={execute}
          stockTab={stockTab} setStockTab={setStockTab}
          rollFilter={rollFilter} setRollFilter={setRollFilter}
        />
      ) : (
        <>
          {completed ? (
            <Card className="max-w-3xl border-emerald-500/30">
              <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-6 w-6 text-emerald-600"/>Impressão registrada com sucesso</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p role="status" className="text-sm text-muted-foreground">A movimentação foi confirmada. O estoque foi atualizado quando a consulta foi concluída.</p>
                <div className="grid gap-3 rounded-lg bg-muted/60 p-4 sm:grid-cols-3">
                  <Detail label="OS" value={completed.os} />
                  <Detail label="Bobina" value={completed.rollCode} />
                  <Detail label="Consumo registrado" value={fmt(completed.consumed) + " m"} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={() => startNext(true)}>Outra impressão desta OS</Button>
                  <Button variant="outline" onClick={() => startNext(false)}>Iniciar impressão de outra OS</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <Card>
                <CardHeader><CardTitle className="text-base">Registrar impressão</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  {!rolls.some(roll => !roll.archived_at) && <div className="rounded-lg border border-dashed p-4 text-sm">Nenhuma bobina cadastrada. <Button variant="link" className="px-1" onClick={() => openStock("rolls")}>Ir para o estoque</Button></div>}
                  <section className="space-y-3" aria-labelledby="print-step-os">
                    <Step id="print-step-os" number="1" icon={<Search className="h-4 w-4"/>} title="Identificação da impressão"/>
                    <Field id="print-os" label="Número da OS" hint="Use o número oficial da Ordem de Serviço.">
                      <Input id="print-os" value={os} onChange={event => { setOs(event.target.value); setSelectedOrder(null); setManualOrder(false); }} disabled={busy} autoComplete="off" placeholder="Digite o número da OS"/>
                    </Field>
                    {searching && <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status"><Loader2 className="h-3 w-3 animate-spin"/>Buscando OS...</p>}
                    {suggestions.length > 0 && !orderReady && <div aria-label="Resultados da busca de OS" className="space-y-1 rounded-lg border p-2">
                      {suggestions.map(item => <button key={item.id} type="button" className="flex w-full flex-col rounded-md p-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setOs(item.sale_number); setSelectedOrder(item); setManualOrder(false); setSuggestions([]); }}>
                        <span className="text-sm font-semibold">OS {item.sale_number}</span>
                        <span className="text-xs text-muted-foreground">{item.client_name || "Cliente não informado"}{item.title ? " · " + item.title : ""}</span>
                      </button>)}
                    </div>}
                    {selectedOrder && <div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm"><CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-600"/>OS {selectedOrder.sale_number} selecionada{selectedOrder.client_name ? " · " + selectedOrder.client_name : ""}.</div>}
                    {!orderReady && os.trim() && !searching && <div className="space-y-2 rounded-lg bg-muted/60 p-3">
                      <p className="text-xs text-muted-foreground">{searchFailure ? "A consulta assistida não está disponível para este acesso." : "Não encontrou a OS na lista? Você ainda pode usar o número informado."} A validação definitiva ocorrerá ao registrar.</p>
                      <Button type="button" size="sm" variant="outline" onClick={() => { setManualOrder(true); setSuggestions([]); }} disabled={busy}>Continuar com OS {os.trim()}</Button>
                    </div>}
                  </section>
                  <section className="space-y-3" aria-labelledby="print-step-roll">
                    <Step id="print-step-roll" number="2" icon={<Layers className="h-4 w-4"/>} title="Material e bobina"/>
                    <Field id="print-material" label="Material">
                      <select id="print-material" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" disabled={busy || !materials.length} value={chosenMaterial} onChange={event => { setMaterial(event.target.value); setRollId(""); }}>
                        {!materials.length && <option value="">Nenhum material cadastrado</option>}
                        {materials.map(item => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </Field>
                    <div className="space-y-2">
                      <Label>Bobina utilizada</Label>
                      {!candidates.length && <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Nenhuma bobina deste material. Cadastre uma bobina no estoque.</p>}
                      <div role="radiogroup" aria-label="Bobina utilizada" className="grid gap-2 sm:grid-cols-2">
                        {candidates.map(roll => {
                          const issue = compatibility(roll);
                          const disabled = busy || Boolean(issue);
                          const checked = rollId === roll.id;
                          return <button key={roll.id} role="radio" aria-checked={checked} type="button" disabled={disabled} onClick={() => setRollId(roll.id)}
                            className={"rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55 " + (checked ? "border-primary bg-primary/5" : "hover:border-primary/50")}>
                            <div className="flex items-center justify-between gap-2"><span className="font-semibold">{roll.code}</span><span className="text-xs text-muted-foreground">{fmt(Number(roll.width_cm),0)} cm</span></div>
                            <div className="mt-2 text-sm font-medium tabular-nums">{fmt(Number(roll.remaining_length_m))} m disponíveis</div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className={"h-full rounded-full " + (Number(roll.remaining_length_m) <= 10 ? "bg-amber-500" : "bg-emerald-600")} style={{width: Math.min(100,100*Number(roll.remaining_length_m)/Number(roll.initial_length_m))+"%"}} /></div>
                            <p className={"mt-2 text-xs " + (issue ? "text-destructive" : Number(roll.remaining_length_m)<=10 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>{issue || (Number(roll.remaining_length_m)<=10 ? "Estoque baixo" : "Disponível")}</p>
                          </button>;
                        })}
                      </div>
                      {selectedIssue && <p role="alert" className="text-xs text-destructive">{selectedIssue}. Escolha outra bobina ou revise a impressão.</p>}
                    </div>
                  </section>
                  <section className="space-y-3" aria-labelledby="print-step-size">
                    <Step id="print-step-size" number="3" icon={<Printer className="h-4 w-4"/>} title="Dimensões e quantidade"/>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field id="print-width" label="Largura (cm)"><Input id="print-width" inputMode="decimal" value={width} onChange={event=>setWidth(event.target.value)} placeholder="Ex.: 100" disabled={busy}/></Field>
                      <Field id="print-length" label="Comprimento (cm)"><Input id="print-length" inputMode="decimal" value={length} onChange={event=>setLength(event.target.value)} placeholder="Ex.: 200" disabled={busy}/></Field>
                    </div>
                    <Field id="print-copies" label="Quantidade de cópias"><Input id="print-copies" inputMode="numeric" value={copies} onChange={event=>setCopies(event.target.value)} disabled={busy}/></Field>
                    {(width || length) && !validDimensions && <p className="text-xs text-destructive" role="alert">Informe largura, comprimento e quantidade válidos.</p>}
                  </section>
                  <section className="border-t pt-4">
                    <button type="button" aria-expanded={extrasOpen} aria-controls="print-extras" className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setExtrasOpen(value=>!value)}>
                      <span>Perdas adicionais e reimpressões</span>{extrasOpen ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
                    </button>
                    {extrasOpen && <div id="print-extras" className="mt-3 space-y-4 rounded-lg bg-muted/50 p-3">
                      <label className="flex items-start gap-3 text-sm"><input className="mt-1 size-4 accent-primary" type="checkbox" checked={wasteEnabled} disabled={busy} onChange={event=>setWasteEnabled(event.target.checked)}/><span><strong>Registrar perda adicional</strong><span className="block text-xs text-muted-foreground">Material além do comprimento das artes.</span></span></label>
                      {wasteEnabled && <Field id="print-waste" label="Perda adicional (cm)" error={!validWaste?"Informe uma perda válida, maior ou igual a zero.":undefined}><Input id="print-waste" inputMode="decimal" value={waste} onChange={event=>setWaste(event.target.value)} disabled={busy}/></Field>}
                      <div className="border-t pt-3"><label className="flex items-start gap-3 text-sm"><input className="mt-1 size-4 accent-primary" type="checkbox" checked={reprint} disabled={busy} onChange={event=>setReprint(event.target.checked)}/><span><strong>Esta impressão é uma reimpressão</strong><span className="block text-xs text-muted-foreground">O motivo ficará registrado no histórico.</span></span></label></div>
                      {reprint && <Field id="print-reason" label="Motivo da reimpressão" error={!reason.trim()?"Informe a justificativa para continuar.":undefined}><textarea id="print-reason" value={reason} onChange={event=>setReason(event.target.value)} rows={3} disabled={busy} placeholder="Descreva o motivo" className="w-full rounded-md border border-input bg-background p-3 text-sm"/></Field>}
                    </div>}
                  </section>
                </CardContent>
              </Card>
              <aside className="xl:sticky xl:top-5">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Printer className="h-4 w-4"/>Resumo do consumo</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2 text-sm">
                      <SummaryLine label="OS" value={os.trim() || "—"}/>
                      <SummaryLine label="Bobina" value={selectedRoll?.code || "Não selecionada"}/>
                      <SummaryLine label="Quantidade" value={validDimensions?String(decimal(copies)):"—"}/>
                      <SummaryLine label="Perda adicional" value={validWaste && wasteEnabled ? fmt(decimal(waste)/100) + " m" : "0,00 m"}/>
                    </div>
                    <div className="rounded-xl bg-muted p-4" aria-live="polite">
                      <p className="text-xs text-muted-foreground">Consumo previsto</p>
                      <p className="mt-1 text-3xl font-semibold tabular-nums">{consumption===null?"—":fmt(consumption)+" m"}</p>
                    </div>
                    <SummaryLine label="Saldo atual da bobina" value={selectedRoll?fmt(Number(selectedRoll.remaining_length_m))+" m":"—"}/>
                    <SummaryLine label="Saldo após impressão" value={selectedRoll && estimate !== null ? fmt(Number(selectedRoll.remaining_length_m)-estimate)+" m":"—"} emphasized/>
                    {selectedIssue && <p role="alert" className="flex items-start gap-2 text-xs text-destructive"><AlertTriangle className="h-4 w-4 shrink-0"/>{selectedIssue}</p>}
                    {!orderReady && <p className="flex items-start gap-2 text-xs text-muted-foreground"><AlertCircle className="h-4 w-4 shrink-0"/>Selecione uma OS ou confirme o número digitado.</p>}
                    <Button className="h-11 w-full" disabled={!canConfirm} onClick={() => {
                      if (!selectedRoll || estimate === null) return;
                      const payload = { rollId: selectedRoll.id, osRef: os.trim(), widthCm: decimal(width), lengthCm: decimal(length), copies: decimal(copies), wasteCm: wasteEnabled?decimal(waste):0, reprint, reason: reprint?reason.trim():"" };
                      const finished: CompletedPrint = { os: os.trim(), rollId: selectedRoll.id, rollCode: selectedRoll.code, consumed: estimate };
                      void execute("print",payload,id=>recordPrint({requestId:id,...payload}),()=>{
                        setCompleted(finished); toast.success("Impressão registrada e estoque atualizado.");
                      });
                    }}>
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle2 className="mr-2 h-4 w-4"/>}Confirmar impressão
                    </Button>
                    <p className="text-xs text-muted-foreground">O consumo considera comprimento × quantidade, mais as perdas adicionais. A confirmação final ocorre no servidor.</p>
                  </CardContent>
                </Card>
              </aside>
            </div>
          )}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4"/>Movimentações recentes</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>Ver histórico</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {events.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>}
              {events.slice(0,5).map(event => <EventRow key={event.id} event={event} rolls={rolls}/>)}
            </CardContent>
          </Card>
        </>
      )}
      <footer className="text-xs text-muted-foreground">As movimentações são vinculadas ao usuário autenticado{user?.email ? " (" + user.email + ")" : ""} e gravadas no histórico.</footer>
    </div>
  );
}

function Metric({icon,value,label,onClick}:{icon:React.ReactNode;value:string;label:string;onClick:()=>void}) {
  return <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <span className="rounded-lg bg-muted p-2 text-muted-foreground">{icon}</span>
    <span className="min-w-0"><span className="block text-xl font-semibold tabular-nums">{value}</span><span className="block text-xs text-muted-foreground">{label}</span></span>
  </button>;
}
function Field({id,label,hint,error,children}:{id:string;label:string;hint?:string;error?:string;children:React.ReactNode}) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}
function Step({id,number,icon,title}:{id:string;number:string;icon:React.ReactNode;title:string}) {
  return <h2 id={id} className="flex items-center gap-2 text-sm font-semibold"><span className="flex size-8 items-center justify-center rounded-lg bg-muted">{icon}</span>{number}. {title}</h2>;
}
function Detail({label,value}:{label:string;value:string}) {
  return <div className="space-y-1"><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold tabular-nums">{value}</p></div>;
}
function SummaryLine({label,value,emphasized=false}:{label:string;value:string;emphasized?:boolean}) {
  return <div className={"flex items-center justify-between gap-3 text-sm " + (emphasized?"border-t pt-3 font-semibold":"")}><span className="text-muted-foreground">{label}</span><span className="text-right tabular-nums">{value}</span></div>;
}
function EventRow({event,rolls}:{event:StockEvent;rolls:PrintRoll[]}) {
  const labels:Record<StockEvent["kind"],string> = { ROLL_IN:"Entrada de bobina",PRINT:"Impressão",REPRINT:"Reimpressão",ROLL_ADJUST:"Ajuste de bobina",ROLL_ARCHIVE:"Exclusão administrativa de bobina",INK_IN:"Entrada de tinta",INK_USE:"Abastecimento de tinta" };
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0 last:pb-0">
    <div className="min-w-0"><p className="text-sm font-medium">{labels[event.kind]}</p><p className="text-xs text-muted-foreground">{event.os_ref?"OS "+event.os_ref+" · ":""}{rolls.find(roll=>roll.id===event.roll_id)?.code || event.color || ""} · {new Date(event.created_at).toLocaleString("pt-BR")}</p></div>
    <span className="text-sm font-semibold tabular-nums">{event.delta_m!==null?(Number(event.delta_m)>0?"+":"")+fmt(Number(event.delta_m))+" m":(Number(event.delta_ml)>0?"+":"")+fmt(Number(event.delta_ml),0)+" mL"}</span>
  </div>;
}
