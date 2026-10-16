import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Droplets, History, Loader2, PackagePlus, Pencil, Printer, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { addPrintRoll, adjustPrintRoll, loadPrintStock, movePrintInk, recordPrint } from "../repository";
import { decimal, estimatePrint, type InkBalance, type PrintRoll, type StockEvent } from "../model";

const inputClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const format = (value:number,digits=2) => value.toLocaleString("pt-BR",{minimumFractionDigits:digits,maximumFractionDigits:digits});
const inkNames:Record<string,string> = {C:"Ciano",M:"Magenta",Y:"Amarelo",K:"Preto"};
const inkColors:Record<string,string> = {C:"#00a5cf",M:"#d34b91",Y:"#d2aa1c",K:"#343943"};
const readError=(error:unknown)=>error instanceof Error?error.message:"Não foi possível salvar. Tente novamente.";

export default function PrintingInventoryPage() {
  const { user } = useAuth();
  const [tab,setTab] = useState<"prints"|"stock">("prints");
  const [stockTab,setStockTab] = useState<"rolls"|"inks">("rolls");
  const [rolls,setRolls] = useState<PrintRoll[]>([]);
  const [inks,setInks] = useState<InkBalance[]>([]);
  const [events,setEvents] = useState<StockEvent[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const attempts=useRef<Record<string,string>>({});

  const [os,setOs] = useState("");
  const [material,setMaterial] = useState("");
  const [rollId,setRollId] = useState("");
  const [width,setWidth] = useState("");
  const [length,setLength] = useState("");
  const [copies,setCopies] = useState("1");
  const [extras,setExtras] = useState(false);
  const [waste,setWaste] = useState("0");
  const [reprint,setReprint] = useState(false);
  const [reprintReason,setReprintReason] = useState("");

  const [showNew,setShowNew] = useState(false);
  const [newMaterial,setNewMaterial] = useState("");
  const [newWidth,setNewWidth] = useState("137");
  const [newLength,setNewLength] = useState("50");
  const [adjustId,setAdjustId] = useState("");
  const [adjustBalance,setAdjustBalance] = useState("");
  const [adjustReason,setAdjustReason] = useState("");
  const [labelId,setLabelId] = useState("");

  const [inkColor,setInkColor] = useState("C");
  const [inkAmount,setInkAmount] = useState("250");
  const [inkEntry,setInkEntry] = useState(false);

  const refresh = useCallback(async () => {
    const data=await loadPrintStock();
    setRolls(data.rolls);setInks(data.inks);setEvents(data.events);
  },[]);
  useEffect(()=>{
    let active=true;
    loadPrintStock().then(data=>{
      if(active){setRolls(data.rolls);setInks(data.inks);setEvents(data.events);}
    }).catch(error=>{if(active)toast.error(readError(error));})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[]);

  const execute=async(key:string, fn:(requestId:string)=>Promise<void>, after:()=>void)=>{
    if(busy)return;
    const requestId=attempts.current[key]??crypto.randomUUID();
    attempts.current[key]=requestId;
    setBusy(true);
    try {
      await fn(requestId);
      delete attempts.current[key];
      after();
      try {await refresh();}catch(error){toast.error("Registro salvo, mas não foi possível atualizar a tela. Atualize para conferir.");}
    } catch(error) {
      toast.error(readError(error));
    } finally {setBusy(false);}
  };

  const materials=useMemo(()=>Array.from(new Set(rolls.map(b=>b.material))).sort(),[rolls]);
  const chosenMaterial=material&&materials.includes(material)?material:(materials[0]??"");
  const available=rolls.filter(b=>b.material===chosenMaterial&&Number(b.remaining_length_m)>0);
  const chosenRoll=available.find(b=>b.id===rollId)??available[0];
  const selectedInk=inks.find(t=>t.color===inkColor);
  let calculated:number|null=null;
  let problem="";
  try {
    calculated=estimatePrint(chosenRoll,decimal(width),decimal(length),decimal(copies),extras?decimal(waste):0);
  } catch(error) {problem=readError(error);}
  if(!os.trim())problem="Informe o número da OS.";
  if(extras&&reprint&&!reprintReason.trim())problem="Informe o motivo da reimpressão.";
  const adjustRoll=rolls.find(b=>b.id===adjustId);
  const adjustValue=decimal(adjustBalance);
  const canAdjust=Boolean(adjustRoll&&Number.isFinite(adjustValue)&&adjustValue>=0&&adjustValue<=Number(adjustRoll.initial_length_m)&&adjustReason.trim().length>=3);
  const ml=decimal(inkAmount);
  const canInk=Boolean(selectedInk&&Number.isFinite(ml)&&ml>0&&(inkEntry||ml<=Number(selectedInk.balance_ml)));
  const canNew=Boolean(newMaterial.trim().length>=2&&Number.isFinite(decimal(newWidth))&&decimal(newWidth)>0&&decimal(newWidth)<=500&&Number.isFinite(decimal(newLength))&&decimal(newLength)>0);
  const warningCount=rolls.filter(b=>Number(b.remaining_length_m)>0&&Number(b.remaining_length_m)<=10).length;
  const inkTotal=inks.reduce((sum,item)=>sum+Number(item.balance_ml),0);
  const switchTab=(next:"prints"|"stock")=>{setTab(next);};

  if(loading)return <div role="status" className="flex min-h-40 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/> Carregando estoque...</div>;

  return (
    <div className="space-y-5 pb-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Impressão & Estoque</h1>
        <p className="text-sm text-muted-foreground">Controle simples de bobinas e tintas da produção.</p>
      </header>
      <div className="flex gap-2 border-b pb-3" role="tablist" aria-label="Impressão e estoque">
        <Button role="tab" aria-selected={tab==="prints"} variant={tab==="prints"?"default":"ghost"} onClick={()=>switchTab("prints")}>Impressões</Button>
        <Button role="tab" aria-selected={tab==="stock"} variant={tab==="stock"?"default":"ghost"} onClick={()=>switchTab("stock")}>Estoque</Button>
        <Button className="ml-auto" variant="ghost" size="sm" disabled={busy} onClick={()=>void refresh().catch(e=>toast.error(readError(e)))}>Atualizar</Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Summary icon={<Printer className="h-4 w-4"/>} value={String(rolls.filter(b=>Number(b.remaining_length_m)>0).length)} label="Bobinas disponíveis"/>
        <Summary icon={<AlertTriangle className="h-4 w-4"/>} value={String(warningCount)} label="Bobinas até 10 m"/>
        <Summary icon={<Droplets className="h-4 w-4"/>} value={format(inkTotal/1000,1)+" L"} label="Tintas em estoque"/>
      </div>

      {tab==="prints" ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(275px,0.85fr)]">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Registrar impressão</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {rolls.length===0&&<p className="rounded-lg bg-muted p-3 text-sm">Cadastre a primeira bobina em Estoque → Adesivos antes de registrar uma impressão.</p>}
              <Field label="Número da OS">
                <Input value={os} onChange={e=>setOs(e.target.value)} placeholder="Número cadastrado na OS" disabled={busy}/>
              </Field>
              <Field label="Material">
                <select className={inputClass} value={chosenMaterial} onChange={e=>{setMaterial(e.target.value);setRollId("");}} disabled={busy||!materials.length}>
                  {!materials.length&&<option value="">Sem materiais</option>}
                  {materials.map(item=><option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="Bobina utilizada">
                <select className={inputClass} value={chosenRoll?.id??""} onChange={e=>setRollId(e.target.value)} disabled={busy||!available.length}>
                  {!available.length&&<option value="">Sem bobinas disponíveis</option>}
                  {available.map(b=><option key={b.id} value={b.id}>{b.code} · {format(Number(b.width_cm),0)} cm · {format(Number(b.remaining_length_m))} m</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Largura da arte (cm)"><Input inputMode="decimal" value={width} onChange={e=>setWidth(e.target.value)} disabled={busy} placeholder="100"/></Field>
                <Field label="Comprimento (cm)"><Input inputMode="decimal" value={length} onChange={e=>setLength(e.target.value)} disabled={busy} placeholder="200"/></Field>
              </div>
              <Field label="Quantidade"><Input inputMode="numeric" value={copies} onChange={e=>setCopies(e.target.value)} disabled={busy}/></Field>
              <button type="button" className="flex w-full items-center justify-between border-t pt-3 text-left text-sm font-medium" aria-expanded={extras} onClick={()=>setExtras(v=>!v)}>
                Perdas ou reimpressões {extras?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}
              </button>
              {extras&&<div className="space-y-3 rounded-lg bg-muted/60 p-3">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reprint} onChange={e=>setReprint(e.target.checked)} disabled={busy}/> Esta impressão é uma reimpressão</label>
                {reprint&&<Field label="Motivo da reimpressão"><Input value={reprintReason} onChange={e=>setReprintReason(e.target.value)} disabled={busy} placeholder="Ex.: falha na impressão"/></Field>}
                <Field label="Perda adicional (cm)"><Input inputMode="decimal" value={waste} onChange={e=>setWaste(e.target.value)} disabled={busy}/></Field>
              </div>}
              <div className="space-y-1 rounded-xl bg-muted p-4">
                <p className="text-xs text-muted-foreground">Consumo estimado da bobina</p>
                <p className="text-2xl font-semibold tabular-nums">{calculated===null?"—":format(calculated)+" m"}</p>
                {chosenRoll&&<p className="text-xs text-muted-foreground">Disponível na {chosenRoll.code}: {format(Number(chosenRoll.remaining_length_m))} m</p>}
              </div>
              {problem&&<p className="text-xs text-muted-foreground">{problem}</p>}
              <Button className="w-full" disabled={busy||calculated===null||Boolean(problem)} onClick={()=>void execute("print", async requestId=>{
                await recordPrint({requestId,rollId:chosenRoll!.id,osRef:os.trim(),widthCm:decimal(width),lengthCm:decimal(length),copies:decimal(copies),wasteCm:extras?decimal(waste):0,reprint:extras&&reprint,reason:extras&&reprint?reprintReason.trim():""});
              },()=>{toast.success("Impressão registrada e estoque atualizado.");setOs("");setExtras(false);setWaste("0");setReprint(false);setReprintReason("");})}>
                {busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<CheckCircle2 className="mr-2 h-4 w-4"/>} Confirmar impressão
              </Button>
              <p className="text-xs text-muted-foreground">O consumo é calculado pelo comprimento informado × quantidade, mais eventuais perdas extras. O número da OS deve existir no sistema.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4"/> Histórico recente</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {events.length===0&&<p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>}
              {events.slice(0,12).map(event=><div key={event.id} className="flex items-start justify-between gap-3 border-b pb-3 last:border-0">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{eventLabel(event)}</p>
                  <p className="break-words text-xs text-muted-foreground">{event.os_ref?"OS "+event.os_ref+" · ":""}{rolls.find(b=>b.id===event.roll_id)?.code??event.color??""}{event.reason?" · "+event.reason:""}</p>
                  <p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("pt-BR")}</p>
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums">{event.delta_m!==null?(Number(event.delta_m)>0?"+":"")+format(Number(event.delta_m))+" m":(Number(event.delta_ml)>0?"+":"")+format(Number(event.delta_ml),0)+" mL"}</p>
              </div>)}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2" role="tablist" aria-label="Tipo de estoque">
            <Button size="sm" role="tab" aria-selected={stockTab==="rolls"} variant={stockTab==="rolls"?"secondary":"outline"} onClick={()=>setStockTab("rolls")}>Adesivos</Button>
            <Button size="sm" role="tab" aria-selected={stockTab==="inks"} variant={stockTab==="inks"?"secondary":"outline"} onClick={()=>setStockTab("inks")}>Tintas</Button>
          </div>
          {stockTab==="rolls" ? <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div><h2 className="font-medium">Bobinas cadastradas</h2><p className="text-xs text-muted-foreground">Saldo independente para cada bobina.</p></div>
              <Button onClick={()=>{setShowNew(v=>!v);setAdjustId("");setLabelId("");}}>{showNew?"Fechar":"Nova bobina"}</Button>
            </div>
            {showNew&&<Card><CardContent className="space-y-3 pt-5">
              <h3 className="font-semibold">Cadastrar bobina</h3>
              <Field label="Material"><Input value={newMaterial} onChange={e=>setNewMaterial(e.target.value)} placeholder="Ex.: Adesivo branco brilho" disabled={busy}/></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Largura (cm)"><Input inputMode="decimal" value={newWidth} onChange={e=>setNewWidth(e.target.value)} disabled={busy}/></Field>
                <Field label="Metragem inicial (m)"><Input inputMode="decimal" value={newLength} onChange={e=>setNewLength(e.target.value)} disabled={busy}/></Field>
              </div>
              <Button className="w-full" disabled={busy||!canNew} onClick={()=>void execute("create",id=>addPrintRoll({requestId:id,material:newMaterial.trim(),widthCm:decimal(newWidth),lengthM:decimal(newLength)}),()=>{
                setShowNew(false);setNewMaterial("");toast.success("Bobina cadastrada. Cole a etiqueta de identificação.");
              })}><PackagePlus className="mr-2 h-4 w-4"/> Cadastrar bobina</Button>
            </CardContent></Card>}
            {rolls.map(b=><Card key={b.id}><CardContent className="space-y-3 pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="font-semibold">{b.code}</p><p className="text-sm">{b.material}</p><p className="text-xs text-muted-foreground">{format(Number(b.width_cm),0)} cm de largura</p></div>
                <div className="text-right"><p className="text-lg font-semibold tabular-nums">{format(Number(b.remaining_length_m))} m</p><p className="text-xs text-muted-foreground">de {format(Number(b.initial_length_m))} m</p></div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={"h-full rounded-full "+(Number(b.remaining_length_m)<=10?"bg-amber-500":"bg-emerald-600")} style={{width:Math.min(100,100*Number(b.remaining_length_m)/Number(b.initial_length_m))+"%"}}/></div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{Number(b.remaining_length_m)===0?"Esgotada":Number(b.remaining_length_m)<=10?"Estoque baixo":"Disponível"}</p>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={()=>{setLabelId(labelId===b.id?"":b.id);setAdjustId("");}}><Tag className="mr-1 h-4 w-4"/> Etiqueta</Button>
                  <Button variant="outline" size="sm" onClick={()=>{setAdjustId(adjustId===b.id?"":b.id);setAdjustBalance(String(b.remaining_length_m).replace(".",","));setAdjustReason("");setLabelId("");}}><Pencil className="mr-1 h-4 w-4"/> Ajustar</Button>
                </div>
              </div>
              {labelId===b.id&&<div className="space-y-2 rounded-lg border border-dashed p-4 text-center">
                <p className="text-xs font-semibold">EVOLUÇÃO · IMPRESSÃO</p><p className="text-3xl font-bold">{b.code}</p><p className="text-sm">{b.material}</p><p className="text-xs">{format(Number(b.width_cm),0)} cm · {format(Number(b.initial_length_m))} m iniciais</p>
                <Button variant="outline" size="sm" onClick={()=>void navigator.clipboard.writeText([b.code,b.material,String(b.width_cm)+" cm",String(b.initial_length_m)+" m"].join(" | ")).then(()=>toast.success("Identificação copiada.")).catch(()=>toast.error("Não foi possível copiar."))}>Copiar identificação</Button>
              </div>}
              {adjustId===b.id&&<div className="space-y-3 rounded-lg bg-muted/50 p-3">
                <p className="text-sm font-medium">Conferência física da bobina</p>
                <Field label="Saldo encontrado (m)"><Input value={adjustBalance} onChange={e=>setAdjustBalance(e.target.value)} inputMode="decimal" disabled={busy}/></Field>
                <Field label="Motivo do ajuste"><Input value={adjustReason} onChange={e=>setAdjustReason(e.target.value)} placeholder="Ex.: conferência de metragem" disabled={busy}/></Field>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" disabled={busy} onClick={()=>setAdjustId("")}>Cancelar</Button>
                  <Button disabled={busy||!canAdjust} onClick={()=>void execute("adjust-"+b.id,id=>adjustPrintRoll({requestId:id,rollId:b.id,newLengthM:adjustValue,reason:adjustReason.trim()}),()=>{setAdjustId("");toast.success("Saldo corrigido com histórico.");})}>Salvar ajuste</Button>
                </div>
              </div>}
            </CardContent></Card>)}
            {!rolls.length&&<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma bobina cadastrada.</p>}
          </div> : <div className="space-y-4">
            <div><h2 className="font-medium">Estoque de tintas</h2><p className="text-xs text-muted-foreground">Quantidade disponível em frascos e galões, fora dos reservatórios.</p></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {["C","M","Y","K"].map(color=><Card key={color}><CardContent className="space-y-2 pt-4">
                <p className="flex items-center gap-2 text-sm font-medium"><span className="h-3 w-3 rounded-full" style={{background:inkColors[color]}}/>{inkNames[color]}</p>
                <p className="text-xl font-semibold tabular-nums">{format(Number(inks.find(t=>t.color===color)?.balance_ml??0),0)} mL</p>
              </CardContent></Card>)}
            </div>
            <Card className="max-w-lg"><CardContent className="space-y-4 pt-5">
              <h3 className="font-semibold">Movimentar tinta</h3>
              <div className="flex gap-2">
                <Button variant={!inkEntry?"default":"outline"} onClick={()=>setInkEntry(false)}>Abastecer</Button>
                <Button variant={inkEntry?"default":"outline"} onClick={()=>setInkEntry(true)}>Entrada</Button>
              </div>
              <Field label="Cor">
                <select className={inputClass} value={inkColor} onChange={e=>setInkColor(e.target.value)}>{["C","M","Y","K"].map(c=><option key={c} value={c}>{inkNames[c]}</option>)}</select>
              </Field>
              <Field label="Quantidade (mL)"><Input value={inkAmount} inputMode="decimal" onChange={e=>setInkAmount(e.target.value)} disabled={busy}/></Field>
              <div className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">Saldo após movimentação</p><p className="text-xl font-semibold">{canInk?format(Number(selectedInk!.balance_ml)+(inkEntry?ml:-ml),0)+" mL":"—"}</p></div>
              {!canInk&&<p className="text-xs text-muted-foreground">Informe uma quantidade válida que não exceda o estoque disponível.</p>}
              <Button className="w-full" disabled={busy||!canInk} onClick={()=>void execute("ink",id=>movePrintInk({requestId:id,color:inkColor,quantityMl:ml,entry:inkEntry}),()=>toast.success(inkEntry?"Entrada de tinta registrada.":"Abastecimento registrado."))}>
                <Droplets className="mr-2 h-4 w-4"/> {inkEntry?"Registrar entrada":"Confirmar abastecimento"}
              </Button>
            </CardContent></Card>
          </div>}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Movimentações são vinculadas ao usuário autenticado{user?.email?" ("+user.email+")":""} e ficam gravadas no histórico do estoque.</p>
    </div>
  );
}

function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
function Summary({icon,value,label}:{icon:React.ReactNode;value:string;label:string}) {
  return <div className="space-y-1 rounded-xl bg-muted/70 p-3"><span className="text-muted-foreground">{icon}</span><p className="text-xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}
function eventLabel(event:StockEvent):string {
  const names:Record<StockEvent["kind"],string>={
    ROLL_IN:"Entrada de bobina",PRINT:"Impressão",REPRINT:"Reimpressão",
    ROLL_ADJUST:"Ajuste de bobina",INK_IN:"Entrada de tinta",INK_USE:"Abastecimento de tinta",
  };
  return names[event.kind]??"Movimentação";
}
