
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Droplets, Loader2, PackagePlus, Pencil, Search, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { addPrintRoll, adjustPrintRoll, archivePrintRoll, movePrintInk } from "../repository";
import { useAuth } from "@/contexts/AuthContext";
import { decimal, type InkBalance, type PrintRoll } from "../model";
import type { RunInventoryOperation } from "../pages/PrintingInventoryPage";

type RollFilter = "all" | "available" | "low" | "empty" | "archived";
type Props = {
  rolls: PrintRoll[];
  inks: InkBalance[];
  busy: boolean;
  execute: RunInventoryOperation;
  stockTab: "rolls" | "inks";
  setStockTab: (tab: "rolls" | "inks") => void;
  rollFilter: RollFilter;
  setRollFilter: (filter: RollFilter) => void;
};
const fmt = (value: number, digits=2) => value.toLocaleString("pt-BR",{ minimumFractionDigits:digits, maximumFractionDigits:digits });
const colors: { code: InkBalance["color"]; name: string; color: string }[] = [
  {code:"C",name:"Ciano",color:"#00a5cf"},
  {code:"M",name:"Magenta",color:"#d34b91"},
  {code:"Y",name:"Amarelo",color:"#d2aa1c"},
  {code:"K",name:"Preto",color:"#343943"},
];
function rollStatus(roll: PrintRoll) {
  const value = Number(roll.remaining_length_m);
  return value <= 0 ? "empty" : value <= 10 ? "low" : "available";
}
export function PrintingStockPanel({rolls,inks,busy,execute,stockTab,setStockTab,rollFilter,setRollFilter}:Props) {
  const { isAdmin } = useAuth();
  const [query,setQuery] = useState("");
  const [sort,setSort] = useState<"code"|"material"|"balance">("code");
  const [panel,setPanel] = useState<"new"|"adjust"|"label"|"delete"|null>(null);
  const [targetId,setTargetId] = useState("");
  const [newMaterial,setNewMaterial] = useState("");
  const [newWidth,setNewWidth] = useState("137");
  const [newLength,setNewLength] = useState("50");
  const [adjustBalance,setAdjustBalance] = useState("");
  const [adjustReason,setAdjustReason] = useState("");
  const [deleteReason,setDeleteReason] = useState("");
  const [deleteConfirmation,setDeleteConfirmation] = useState("");
  const [inkColor,setInkColor] = useState<InkBalance["color"]>("C");
  const [inkAmount,setInkAmount] = useState("250");
  const [inkEntry,setInkEntry] = useState(false);

  const activeCount = rolls.filter(roll => !roll.archived_at).length;
  const filtered = useMemo(() => rolls.filter(roll => {
    if (rollFilter === "archived") {
      if (!isAdmin || !roll.archived_at) return false;
    } else if (roll.archived_at) return false;
    const status = rollStatus(roll);
    const matchesStatus = rollFilter === "all" || rollFilter === "archived" ||
      (rollFilter === "available" ? status !== "empty" : status === rollFilter);
    const matchesSearch = (roll.code+" "+roll.material+" "+roll.width_cm).toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR").trim());
    return matchesStatus && matchesSearch;
  }).sort((a,b) => sort==="balance" ? Number(a.remaining_length_m)-Number(b.remaining_length_m) :
    sort==="material" ? a.material.localeCompare(b.material,"pt-BR") : a.code.localeCompare(b.code,"pt-BR")), [rolls,rollFilter,query,sort,isAdmin]);

  const target = rolls.find(roll=>roll.id===targetId);
  const validNew = newMaterial.trim().length>=2 && newMaterial.trim().length<=120 &&
    Number.isFinite(decimal(newWidth)) && decimal(newWidth)>0 && decimal(newWidth)<=500 &&
    Number.isFinite(decimal(newLength)) && decimal(newLength)>0 && decimal(newLength)<=10000;
  const newBalance = decimal(adjustBalance);
  const validAdjust = Boolean(target && adjustBalance.trim() && Number.isFinite(newBalance) && newBalance>=0 &&
    newBalance<=Number(target.initial_length_m) && adjustReason.trim().length>=3);
  const selectedInk = inks.find(ink=>ink.color===inkColor);
  const inkBalance = Number(selectedInk?.balance_ml ?? 0);
  const amount = decimal(inkAmount);
  const validInk = inkAmount.trim()!=="" && Number.isFinite(amount) && amount>0 && amount<=100000 &&
    (inkEntry || amount<=inkBalance);
  const close = () => { if (!busy) { setPanel(null); setTargetId(""); setDeleteReason(""); setDeleteConfirmation(""); } };
  const showPanel = (action:"new"|"adjust"|"label"|"delete",roll?:PrintRoll) => {
    if (busy) return;
    setPanel(action); setTargetId(roll?.id ?? "");
    if (action==="adjust" && roll) { setAdjustBalance(String(roll.remaining_length_m).replace(".",",")); setAdjustReason(""); }
    if (action==="delete") { setDeleteReason(""); setDeleteConfirmation(""); }
  };
  const copyLabel = async () => {
    if (!target) return;
    try {
      await navigator.clipboard.writeText([target.code,target.material,fmt(Number(target.width_cm),0)+" cm",fmt(Number(target.initial_length_m))+" m"].join(" | "));
      toast.success("Identificação copiada.");
    } catch { toast.error("Não foi possível copiar a identificação."); }
  };

  return <div className="space-y-4">
    <div className="flex gap-2" role="group" aria-label="Tipo de estoque">
      <Button variant={stockTab==="rolls"?"default":"outline"} onClick={()=>setStockTab("rolls")}>Bobinas</Button>
      <Button variant={stockTab==="inks"?"default":"outline"} onClick={()=>setStockTab("inks")}>Tintas</Button>
    </div>

    {stockTab==="rolls" ? <section className="space-y-4" aria-labelledby="rolls-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="rolls-heading" className="text-lg font-semibold">Estoque de bobinas</h2><p className="text-sm text-muted-foreground">Cada bobina possui identificação e saldo independente.</p></div>
        <Button onClick={()=>showPanel("new")}><PackagePlus className="mr-2 h-4 w-4"/>Nova bobina</Button>
      </div>
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input aria-label="Buscar bobinas" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar código ou material" className="pl-9"/></div>
            <div className="space-y-1"><Label htmlFor="roll-sort" className="sr-only">Ordenar bobinas</Label><select id="roll-sort" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={sort} onChange={event=>setSort(event.target.value as typeof sort)}>
              <option value="code">Ordenar por código</option><option value="material">Ordenar por material</option><option value="balance">Menor saldo primeiro</option>
            </select></div>
          </div>
          <div role="group" aria-label="Filtrar bobinas" className="flex flex-wrap gap-2">
            {([...[{key:"all",label:"Todas"},{key:"available",label:"Com saldo"},{key:"low",label:"Estoque baixo"},{key:"empty",label:"Esgotadas"}],...(isAdmin?[{key:"archived",label:"Excluídas"}]:[])] as {key:RollFilter;label:string}[]).map(filter =>
              <Button key={filter.key} size="sm" variant={rollFilter===filter.key?"secondary":"outline"} aria-pressed={rollFilter===filter.key} onClick={()=>setRollFilter(filter.key)}>{filter.label}</Button>)}
          </div>
          {filtered.length===0 ? <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">{activeCount?"Nenhuma bobina corresponde à busca ou aos filtros.":"Nenhuma bobina cadastrada."}</p>
            {!activeCount && rollFilter!=="archived" && <Button className="mt-3" variant="outline" onClick={()=>showPanel("new")}>Cadastrar primeira bobina</Button>}
            {activeCount>0 && <Button className="mt-3" variant="outline" onClick={()=>{setQuery("");setRollFilter("all");}}>Limpar filtros</Button>}
          </div> : <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs text-muted-foreground"><tr>
                  <th scope="col" className="p-3">Código</th><th scope="col" className="p-3">Material</th><th scope="col" className="p-3">Largura</th><th scope="col" className="p-3">Metragem disponível</th><th scope="col" className="p-3">Situação</th><th scope="col" className="p-3 text-right">Ações</th>
                </tr></thead>
                <tbody>{filtered.map(roll=><tr key={roll.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-semibold">{roll.code}</td><td className="max-w-60 p-3 break-words">{roll.material}</td><td className="p-3 tabular-nums">{fmt(Number(roll.width_cm),0)} cm</td>
                  <td className="min-w-36 p-3"><RollBalance roll={roll}/></td><td className="p-3"><RollStatus roll={roll}/></td>
                  <td className="p-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={()=>showPanel("label",roll)}><Tag className="mr-1 h-4 w-4"/>Etiqueta</Button><Button variant="outline" size="sm" disabled={Boolean(roll.archived_at)} onClick={()=>showPanel("adjust",roll)}><Pencil className="mr-1 h-4 w-4"/>Ajustar</Button>{isAdmin && !roll.archived_at && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={()=>showPanel("delete",roll)}><Trash2 className="mr-1 h-4 w-4"/>Excluir</Button>}</div></td>
                </tr>)}</tbody>
              </table>
            </div>
            <div className="grid gap-3 md:hidden">
              {filtered.map(roll=><div key={roll.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{roll.code}</p><p className="text-sm">{roll.material}</p><p className="text-xs text-muted-foreground">{fmt(Number(roll.width_cm),0)} cm de largura</p></div><RollStatus roll={roll}/></div>
                <RollBalance roll={roll}/>
                <div className="flex gap-2"><Button className="flex-1" variant="outline" size="sm" onClick={()=>showPanel("label",roll)}><Tag className="mr-1 h-4 w-4"/>Etiqueta</Button><Button className="flex-1" variant="outline" size="sm" disabled={Boolean(roll.archived_at)} onClick={()=>showPanel("adjust",roll)}><Pencil className="mr-1 h-4 w-4"/>Ajustar</Button>{isAdmin && !roll.archived_at && <Button variant="outline" size="sm" className="text-destructive" onClick={()=>showPanel("delete",roll)}><Trash2 className="h-4 w-4"/><span className="sr-only">Excluir {roll.code}</span></Button>}</div>
              </div>)}
            </div>
          </>}
          <p className="text-xs text-muted-foreground">{filtered.length} bobinas exibidas · {activeCount} no estoque ativo. Estoque baixo: até 10 metros.</p>
        </CardContent>
      </Card>
    </section> : <section className="space-y-4" aria-labelledby="inks-heading">
      <div><h2 id="inks-heading" className="text-lg font-semibold">Estoque de tintas CMYK</h2><p className="text-sm text-muted-foreground">Volumes em frascos e galões, fora dos reservatórios da impressora.</p></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {colors.map(ink=><Card key={ink.code} className={inkColor===ink.code?"border-primary/60":""}>
          <CardContent className="p-4"><button type="button" aria-pressed={inkColor===ink.code} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={()=>setInkColor(ink.code)}>
            <span className="flex items-center gap-2 text-sm font-medium"><span className="size-3 rounded-full border" style={{backgroundColor:ink.color}}/>{ink.name}</span>
            <span className="mt-3 block text-xl font-semibold tabular-nums">{fmt(Number(inks.find(item=>item.color===ink.code)?.balance_ml ?? 0),0)} mL</span>
            <span className="text-xs text-muted-foreground">Disponível em estoque</span>
          </button></CardContent>
        </Card>)}
      </div>
      <Card className="max-w-2xl">
        <CardHeader><CardTitle className="text-base">Registrar movimentação</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div role="group" aria-label="Tipo de movimentação de tinta" className="flex flex-wrap gap-2">
            <Button variant={!inkEntry?"default":"outline"} onClick={()=>setInkEntry(false)}>Abastecer máquina</Button>
            <Button variant={inkEntry?"default":"outline"} onClick={()=>setInkEntry(true)}>Entrada de tinta</Button>
          </div>
          <p className="text-xs text-muted-foreground">{inkEntry?"Adiciona tinta recebida ao estoque.":"Retira tinta do estoque para abastecer a impressora."}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="ink-color">Cor da tinta</Label><select id="ink-color" value={inkColor} disabled={busy} onChange={event=>setInkColor(event.target.value as InkBalance["color"])} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{colors.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="ink-amount">Quantidade (mL)</Label><Input id="ink-amount" value={inkAmount} inputMode="decimal" onChange={event=>setInkAmount(event.target.value)} disabled={busy}/></div>
          </div>
          <div className="space-y-2 rounded-lg bg-muted/60 p-4" aria-live="polite">
            <p className="text-xs font-medium text-muted-foreground">Prévia da movimentação</p>
            <div className="flex justify-between text-sm"><span>Saldo atual</span><span className="tabular-nums">{fmt(inkBalance,0)} mL</span></div>
            <div className="flex justify-between text-sm"><span>{inkEntry?"Entrada":"Abastecimento"}</span><span className="tabular-nums">{validInk?(inkEntry?"+":"−")+fmt(amount,0)+" mL":"—"}</span></div>
            <div className="flex justify-between border-t pt-2 font-semibold"><span>Saldo previsto</span><span className="tabular-nums">{validInk?fmt(inkBalance+(inkEntry?amount:-amount),0)+" mL":"—"}</span></div>
          </div>
          {!validInk && <p role="alert" className="flex items-start gap-2 text-xs text-destructive"><AlertTriangle className="h-4 w-4 shrink-0"/>Informe uma quantidade positiva{!inkEntry?" que não exceda o saldo disponível":""}.</p>}
          <Button className="w-full sm:w-auto" disabled={busy||!validInk} onClick={()=>{
            const payload={color:inkColor,quantityMl:amount,entry:inkEntry};
            void execute("ink",payload,id=>movePrintInk({requestId:id,...payload}),()=>toast.success(inkEntry?"Entrada de tinta registrada.":"Abastecimento registrado."));
          }}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Droplets className="mr-2 h-4 w-4"/>}{inkEntry?"Registrar entrada":"Confirmar abastecimento"}</Button>
        </CardContent>
      </Card>
    </section>}

    <Sheet open={panel!==null} onOpenChange={open=>{if(!open)close();}}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{panel==="new"?"Cadastrar nova bobina":panel==="adjust"?"Ajustar saldo de "+(target?.code??"bobina"):panel==="delete"?"Excluir "+(target?.code??"bobina"):"Identificação de "+(target?.code??"bobina")}</SheetTitle>
          <SheetDescription>{panel==="new"?"Cadastre a metragem física de uma nova bobina.":panel==="adjust"?"Conferência física com justificativa obrigatória.":panel==="delete"?"Disponível exclusivamente para administradores. O histórico será preservado.":"Informações para etiqueta da bobina."}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {panel==="new" && <>
            <div className="space-y-1.5"><Label htmlFor="new-roll-material">Material</Label><Input id="new-roll-material" value={newMaterial} onChange={event=>setNewMaterial(event.target.value)} placeholder="Ex.: Adesivo branco brilho" disabled={busy}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="new-roll-width">Largura (cm)</Label><Input id="new-roll-width" value={newWidth} inputMode="decimal" onChange={event=>setNewWidth(event.target.value)} disabled={busy}/></div>
              <div className="space-y-1.5"><Label htmlFor="new-roll-length">Metragem inicial (m)</Label><Input id="new-roll-length" value={newLength} inputMode="decimal" onChange={event=>setNewLength(event.target.value)} disabled={busy}/></div>
            </div>
            <p className="text-xs text-muted-foreground">O código da bobina é gerado automaticamente após o cadastro.</p>
            <div className="flex gap-2"><Button variant="outline" onClick={close} disabled={busy}>Cancelar</Button><Button disabled={busy||!validNew} onClick={()=>{
              const payload={material:newMaterial.trim(),widthCm:decimal(newWidth),lengthM:decimal(newLength)};
              void execute("roll-create",payload,id=>addPrintRoll({requestId:id,...payload}),()=>{setPanel(null);setNewMaterial("");toast.success("Bobina cadastrada. Identifique-a com uma etiqueta.");});
            }}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<PackagePlus className="mr-2 h-4 w-4"/>}Cadastrar bobina</Button></div>
          </>}
          {panel==="adjust" && target && <>
            <div className="rounded-lg bg-muted p-3 text-sm"><p className="font-semibold">{target.code} · {target.material}</p><p className="text-muted-foreground">Saldo atual: {fmt(Number(target.remaining_length_m))} m · Inicial: {fmt(Number(target.initial_length_m))} m</p></div>
            <div className="space-y-1.5"><Label htmlFor="roll-adjust-balance">Saldo encontrado (m)</Label><Input id="roll-adjust-balance" value={adjustBalance} inputMode="decimal" onChange={event=>setAdjustBalance(event.target.value)} disabled={busy}/></div>
            <div className="space-y-1.5"><Label htmlFor="roll-adjust-reason">Motivo do ajuste</Label><Input id="roll-adjust-reason" value={adjustReason} onChange={event=>setAdjustReason(event.target.value)} placeholder="Ex.: conferência física" disabled={busy}/></div>
            {!validAdjust && <p className="text-xs text-muted-foreground">Informe um saldo de 0 até a metragem inicial e um motivo de pelo menos 3 caracteres.</p>}
            <div className="flex gap-2"><Button variant="outline" onClick={close} disabled={busy}>Cancelar</Button><Button disabled={busy||!validAdjust} onClick={()=>{
              const payload={rollId:target.id,newLengthM:newBalance,reason:adjustReason.trim()};
              void execute("roll-adjust-"+target.id,payload,id=>adjustPrintRoll({requestId:id,...payload}),()=>{setPanel(null);toast.success("Saldo ajustado e registrado no histórico.");});
            }}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<CheckCircle2 className="mr-2 h-4 w-4"/>}Salvar ajuste</Button></div>
          </>}
          {panel==="delete" && target && isAdmin && !target.archived_at && <>
            <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4"/>Excluir bobina do estoque ativo</p>
              <p className="text-sm"><strong>{target.code}</strong> · {target.material}</p>
              <p className="text-sm">Saldo atual: <strong>{fmt(Number(target.remaining_length_m))} m</strong></p>
              <p className="text-xs text-muted-foreground">A bobina deixará de aparecer na seleção de impressão e não poderá receber novas baixas ou ajustes. Os registros anteriores continuarão disponíveis no histórico. Esta ação não ajusta o estoque de tinta.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="roll-delete-reason">Motivo da exclusão (obrigatório)</Label>
              <textarea id="roll-delete-reason" rows={3} maxLength={500} value={deleteReason} onChange={event=>setDeleteReason(event.target.value)} disabled={busy} placeholder="Ex.: bobina cadastrada incorretamente" className="w-full rounded-md border border-input bg-background p-3 text-sm"/>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="roll-delete-confirmation">Digite {target.code} para confirmar</Label>
              <Input id="roll-delete-confirmation" value={deleteConfirmation} onChange={event=>setDeleteConfirmation(event.target.value)} disabled={busy} autoComplete="off" placeholder={target.code}/>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={close} disabled={busy}>Cancelar</Button>
              <Button variant="destructive" disabled={busy || deleteConfirmation.trim()!==target.code || deleteReason.trim().length<3} onClick={()=>{
                const payload={rollId:target.id,reason:deleteReason.trim()};
                void execute("roll-archive-"+target.id,payload,id=>archivePrintRoll({requestId:id,...payload}),()=>{
                  setPanel(null);setDeleteReason("");setDeleteConfirmation("");setRollFilter("all");
                  toast.success("Bobina excluída do estoque ativo. Histórico preservado.");
                });
              }}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Trash2 className="mr-2 h-4 w-4"/>}Confirmar exclusão</Button>
            </div>
          </>}
          {panel==="label" && target && <>
            <div className="space-y-2 rounded-lg border border-dashed p-5 text-center">
              <p className="text-xs font-semibold">EVOLUÇÃO · IMPRESSÃO</p>
              <p className="text-3xl font-bold">{target.code}</p>
              <p className="text-sm">{target.material}</p>
              <p className="text-xs text-muted-foreground">{fmt(Number(target.width_cm),0)} cm · {fmt(Number(target.initial_length_m))} m iniciais</p>
            </div>
            <Button variant="outline" className="w-full" onClick={()=>void copyLabel()}><Tag className="mr-2 h-4 w-4"/>Copiar identificação</Button>
          </>}
        </div>
      </SheetContent>
    </Sheet>
  </div>;
}
function RollStatus({roll}:{roll:PrintRoll}) {
  const status=rollStatus(roll);
  if (roll.archived_at) return <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">Excluída</span>;
  return <span className={"inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium " + (status==="low"?"bg-amber-500/10 text-amber-700 dark:text-amber-400":status==="empty"?"bg-muted text-muted-foreground":"bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")}>
    {status==="low" && <AlertTriangle className="h-3 w-3"/>}{status==="empty"?"Esgotada":status==="low"?"Estoque baixo":"Disponível"}
  </span>;
}
function RollBalance({roll}:{roll:PrintRoll}) {
  const current=Number(roll.remaining_length_m),initial=Number(roll.initial_length_m);
  const progress=initial>0?Math.min(100,Math.max(0,100*current/initial)):0;
  return <div className="space-y-1.5">
    <div className="text-sm font-semibold tabular-nums">{fmt(current)} m <span className="text-xs font-normal text-muted-foreground">de {fmt(initial)} m</span></div>
    <div role="progressbar" aria-label={"Metragem restante da bobina "+roll.code} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className={"h-full rounded-full "+(current<=10?"bg-amber-500":"bg-emerald-600")} style={{width:progress+"%"}}/>
    </div>
  </div>;
}
