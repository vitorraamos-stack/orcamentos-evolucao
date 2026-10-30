
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, History, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadPrintHistory } from "../repository";
import type { PrintRoll, StockEvent } from "../model";

type DetailedEvent = StockEvent & { created_by: string };
type Filter = "all" | "prints" | "stock";
type Period = "7" | "30" | "all";
const pageSize=10;
const fmt = (value:number, digits=2) => value.toLocaleString("pt-BR",{minimumFractionDigits:digits,maximumFractionDigits:digits});
const labels: Record<StockEvent["kind"],string> = {
  ROLL_IN:"Entrada de bobina",PRINT:"Impressão",REPRINT:"Reimpressão",
  ROLL_ADJUST:"Ajuste de bobina",ROLL_ARCHIVE:"Exclusão de bobina",INK_IN:"Entrada de tinta",INK_USE:"Abastecimento de tinta",
};
const inkNames:Record<string,string>={C:"Ciano",M:"Magenta",Y:"Amarelo",K:"Preto"};
const eventAmount=(event:StockEvent) => event.delta_m !== null ?
  (Number(event.delta_m)>0?"+":"")+fmt(Number(event.delta_m))+" m" :
  (Number(event.delta_ml)>0?"+":"")+fmt(Number(event.delta_ml),0)+" mL";

export function PrintingHistoryPanel({rolls,onBack}:{rolls:PrintRoll[];onBack:()=>void}) {
  const [filter,setFilter]=useState<Filter>("all");
  const [period,setPeriod]=useState<Period>("30");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(0);
  const [events,setEvents]=useState<DetailedEvent[]>([]);
  const [count,setCount]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [reload,setReload]=useState(0);
  const [detail,setDetail]=useState<DetailedEvent|null>(null);

  const since=useMemo(()=>period==="all"?undefined:new Date(Date.now()-Number(period)*24*60*60*1000).toISOString(),[period]);
  useEffect(()=>{
    let cancelled=false;
    const timer=window.setTimeout(()=>{
      setLoading(true);
      setError("");
      void loadPrintHistory({page,pageSize,type:filter,since,search,rolls})
        .then(result=>{if(!cancelled){setEvents(result.rows);setCount(result.count);}})
        .catch(err=>{if(!cancelled){setError(err instanceof Error?err.message:"Não foi possível consultar o histórico.");setEvents([]);setCount(0);}})
        .finally(()=>{if(!cancelled)setLoading(false);});
    },300);
    return ()=>{cancelled=true;window.clearTimeout(timer);};
  },[page,filter,since,search,rolls,reload]);
  const totalPages=Math.max(1,Math.ceil(count/pageSize));
  const setNewFilter=(next:Filter)=>{setFilter(next);setPage(0);};
  const changePeriod=(next:Period)=>{setPeriod(next);setPage(0);};
  const changeSearch=(next:string)=>{setSearch(next);setPage(0);};
  const reference=(event:StockEvent)=> {
    const roll=rolls.find(item=>item.id===event.roll_id);
    return roll ? roll.code+" · "+roll.material : event.color?(inkNames[event.color] ?? event.color):"—";
  };
  return <section className="space-y-4" aria-labelledby="print-history-heading">
    <header className="flex flex-wrap items-center gap-3">
      <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4"/>Voltar</Button>
      <div><h2 id="print-history-heading" className="flex items-center gap-2 text-2xl font-semibold"><History className="h-5 w-5"/>Histórico de movimentações</h2><p className="text-[15px] text-muted-foreground">Consulta somente leitura, com os registros gravados no estoque.</p></div>
    </header>
    <Card>
      <CardHeader><CardTitle className="text-lg">Buscar registros</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input aria-label="Buscar movimentações" placeholder="OS, código ou material" value={search} onChange={event=>changeSearch(event.target.value)} className="pl-9 h-11 text-base md:text-base"/></div>
          <div><label htmlFor="history-period" className="sr-only">Período</label><select id="history-period" value={period} onChange={event=>changePeriod(event.target.value as Period)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-base"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="all">Todo o período</option></select></div>
        </div>
        <div role="group" aria-label="Tipo de movimentação" className="flex flex-wrap gap-2">
          {([{key:"all",label:"Todas"},{key:"prints",label:"Impressões"},{key:"stock",label:"Estoque"}] as {key:Filter;label:string}[]).map(item=>
            <Button key={item.key} size="sm" variant={filter===item.key?"secondary":"outline"} aria-pressed={filter===item.key} onClick={()=>setNewFilter(item.key)}>{item.label}</Button>)}
        </div>
        {loading ? <div role="status" className="flex items-center justify-center gap-2 py-12 text-[15px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Consultando movimentações...</div> :
        error ? <div role="alert" className="rounded-lg border p-5 text-center"><p className="text-[15px] text-destructive">{error}</p><Button variant="outline" className="mt-3" onClick={()=>setReload(value=>value+1)}>Tentar novamente</Button></div> :
        events.length===0 ? <div className="rounded-lg border border-dashed p-8 text-center"><p className="text-[15px] text-muted-foreground">Nenhuma movimentação encontrada para os filtros selecionados.</p><Button variant="outline" className="mt-3" onClick={()=>{changeSearch("");setNewFilter("all");changePeriod("all");}}>Limpar filtros</Button></div> : <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-[15px]"><thead className="border-b text-[13px] text-muted-foreground"><tr><th scope="col" className="p-3">Data</th><th scope="col" className="p-3">Tipo</th><th scope="col" className="p-3">OS</th><th scope="col" className="p-3">Material / Cor</th><th scope="col" className="p-3">Movimentação</th><th scope="col" className="p-3 text-right">Detalhes</th></tr></thead>
              <tbody>{events.map(event=><tr key={event.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="whitespace-nowrap p-3 text-[13px]">{new Date(event.created_at).toLocaleString("pt-BR")}</td>
                <td className="p-3 font-medium">{labels[event.kind]}</td>
                <td className="p-3">{event.os_ref ?? "—"}</td>
                <td className="max-w-52 break-words p-3">{reference(event)}</td>
                <td className="whitespace-nowrap p-3 font-semibold tabular-nums">{eventAmount(event)}</td>
                <td className="p-3 text-right"><Button variant="outline" size="sm" onClick={()=>setDetail(event)}>Visualizar</Button></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {events.map(event=><div key={event.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2"><strong className="text-[15px]">{labels[event.kind]}</strong><span className="text-[15px] font-semibold tabular-nums">{eventAmount(event)}</span></div>
              <p className="text-[13px] text-muted-foreground">{new Date(event.created_at).toLocaleString("pt-BR")} · {event.os_ref?"OS "+event.os_ref:"Sem OS"}</p>
              <p className="break-words text-[13px]">{reference(event)}</p>
              <Button variant="outline" className="w-full" size="sm" onClick={()=>setDetail(event)}>Ver detalhes</Button>
            </div>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-[13px] text-muted-foreground">{count} registros · Página {page+1} de {totalPages}</p>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page===0} onClick={()=>setPage(value=>Math.max(0,value-1))}><ChevronLeft className="mr-1 h-4 w-4"/>Anterior</Button><Button variant="outline" size="sm" disabled={page+1>=totalPages} onClick={()=>setPage(value=>value+1)}>Próxima<ChevronRight className="ml-1 h-4 w-4"/></Button></div>
          </div>
        </>}
      </CardContent>
    </Card>
    <Dialog open={Boolean(detail)} onOpenChange={open=>{if(!open)setDetail(null);}}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{detail?labels[detail.kind]:"Movimentação"}</DialogTitle><DialogDescription>Detalhes auditáveis do registro. Nenhum evento pode ser editado nesta tela.</DialogDescription></DialogHeader>
        {detail && <div className="space-y-3 text-[15px]">
          <Row label="Data e horário" value={new Date(detail.created_at).toLocaleString("pt-BR")}/>
          <Row label="OS" value={detail.os_ref ?? "Não se aplica"}/>
          <Row label="Material ou cor" value={reference(detail)}/>
          <Row label="Variação de estoque" value={eventAmount(detail)}/>
          <Row label="Responsável (ID)" value={detail.created_by}/>
          {detail.reason && <div className="space-y-1 rounded-lg bg-muted p-3"><p className="text-[13px] text-muted-foreground">Motivo registrado</p><p className="break-words">{detail.reason}</p></div>}
          <p className="break-all text-[13px] text-muted-foreground">ID do evento: {detail.id}</p>
        </div>}
      </DialogContent>
    </Dialog>
    <p className="flex items-start gap-2 text-[13px] text-muted-foreground"><Clock3 className="h-4 w-4 shrink-0"/>Os registros são exibidos por data, com paginação e acesso somente leitura. A consulta respeita as permissões atuais do banco.</p>
  </section>;
}
function Row({label,value}:{label:string;value:string}) {
  return <div className="flex flex-wrap justify-between gap-2 border-b pb-2"><span className="text-muted-foreground">{label}</span><span className="max-w-full break-all text-right font-medium">{value}</span></div>;
}
