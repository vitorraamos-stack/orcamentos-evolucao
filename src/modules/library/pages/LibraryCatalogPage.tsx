import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ArrowLeft, BookOpen, CheckCircle2, ClipboardList, FileText, Images, Layers3, Loader2, Package, Plus, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { emptyLibraryDraft, libraryCategories, libraryFieldVisible, libraryMissingFields, validateLibraryDraft, type LibraryDraft, type LibraryField, type LibraryPhoto, type LibraryProductRecord, type LibraryPublishedRecord } from "../model";
import { archiveLibraryProduct, createLibraryDraft, listLibraryDrafts, listLibraryPublications, publishLibraryDraft, restoreLibraryProduct, saveLibraryDraft } from "../repository";

type Section = "info" | "gallery" | "fields" | "addons" | "guides" | "rules";
const sections:{id:Section;name:string;Icon:typeof FileText}[]=[
  {id:"info",name:"Informações",Icon:FileText},
  {id:"gallery",name:"Galeria",Icon:Images},
  {id:"fields",name:"Configuração",Icon:SlidersHorizontal},
  {id:"addons",name:"Complementos",Icon:Layers3},
  {id:"guides",name:"Orientações",Icon:BookOpen},
  {id:"rules",name:"Regras",Icon:ShieldCheck},
];
const selectClass="h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const formatStatus=(item:LibraryProductRecord)=>item.status==="archived"?"Arquivado":item.status==="draft"||item.published_version===0?"Rascunho":item.revision>item.published_revision?"Em revisão":"Publicado";
const initialValues:Record<string,unknown>={};
const makeId=()=>crypto.randomUUID();
const fieldTemplates:LibraryField[]=[
  {id:"medidas",label:"Dimensões do conjunto",type:"dimensions",required:true,when:"always",unit:"cm"},
  {id:"acabamento",label:"Acabamento",type:"select",required:true,when:"always",options:["PVC natural","Pintura personalizada"]},
  {id:"cor",label:"Cor da pintura",type:"text",required:true,when:"paint"},
  {id:"instalacao",label:"Necessita de instalação?",type:"yesno",required:true,when:"always"},
  {id:"superficie",label:"Superfície de instalação",type:"select",required:true,when:"install",options:["Alvenaria","Vidro","Estrutura metálica","Outra / consultar"]},
  {id:"arte_vetorial",label:"Possui arquivo vetorial?",type:"yesno",required:true,when:"always"},
];
const errorText=(error:unknown)=>error instanceof Error?error.message:"Ocorreu um erro inesperado.";
const typeOptions=[["text","Texto"],["number","Número"],["dimensions","Medidas"],["select","Seleção única"],["multi","Múltipla escolha"],["yesno","Sim ou não"],["attachment","Anexo"]] as const;
const whenOptions=[["always","Sempre"],["paint","Se houver pintura"],["install","Se houver instalação"],["noart","Se não houver arte vetorial"]] as const;

function FieldControl({field,values,onChange}:{field:LibraryField;values:Record<string,unknown>;onChange:(id:string,value:unknown)=>void}) {
  if(!libraryFieldVisible(field,values)) return null;
  const val=values[field.id];
  return <div className="space-y-1.5">
    <Label>{field.label}{field.required?" *":""}</Label>
    {field.help&&<p className="text-xs text-muted-foreground">{field.help}</p>}
    {field.type==="dimensions"?<div className="grid grid-cols-2 gap-2">
      {(["width","height"] as const).map(k=><Input key={k} type="number" min="0" placeholder={k==="width"?"Largura":"Altura"} value={(val as Record<string,string>|undefined)?.[k]||""} onChange={e=>onChange(field.id,{...((val as object)||{}),[k]:e.target.value})}/>)}
    </div>:field.type==="yesno"?<select className={selectClass} value={String(val||"")} onChange={e=>onChange(field.id,e.target.value)}>
      <option value="">Selecione...</option><option value="Sim">Sim</option><option value="Não">Não</option>
    </select>:field.type==="select"?<select className={selectClass} value={String(val||"")} onChange={e=>onChange(field.id,e.target.value)}>
      <option value="">Selecione...</option>{(field.options||[]).map(x=><option key={x} value={x}>{x}</option>)}
    </select>:field.type==="multi"?<div className="space-y-2 rounded-lg border p-3">{(field.options||[]).map(x=><label key={x} className="flex items-center gap-2 text-sm"><Checkbox checked={Array.isArray(val)&&val.includes(x)} onCheckedChange={checked=>onChange(field.id,checked?[...(Array.isArray(val)?val:[]).filter(v=>v!==x),x]:(Array.isArray(val)?val:[]).filter(v=>v!==x))}/>{x}</label>)}</div>:field.type==="attachment"?<p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Anexos serão habilitados em uma etapa posterior; este campo ainda não permite envio de arquivos.</p>:<Input type={field.type==="number"?"number":"text"} value={String(val||"")} onChange={e=>onChange(field.id,e.target.value)}/>}
  </div>;
}

export default function LibraryCatalogPage({management=false}:{management?:boolean}) {
  const {isAdmin,user}=useAuth();
  const [,setLocation]=useLocation();
  const admin=management&&isAdmin;
  const [drafts,setDrafts]=useState<LibraryProductRecord[]>([]);
  const [published,setPublished]=useState<LibraryPublishedRecord[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [section,setSection]=useState<Section>("info");
  const [edit,setEdit]=useState<LibraryDraft>(emptyLibraryDraft);
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("active");
  const [category,setCategory]=useState("all");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState("");
  const [answers,setAnswers]=useState<Record<string,unknown>>(initialValues);
  const [photoUrl,setPhotoUrl]=useState("");
  const [photoTitle,setPhotoTitle]=useState("");
  const [addonName,setAddonName]=useState("");
  const [confirmPublish,setConfirmPublish]=useState(false);
  const [confirmArchive,setConfirmArchive]=useState(false);
  const selectedDraft=drafts.find(x=>x.id===selectedId);
  const selectedPublication=published.find(x=>x.product_id===selectedId);
  const dirty=!!selectedDraft&&JSON.stringify(selectedDraft.draft)!==JSON.stringify(edit);
  const current=admin?drafts.map(p=>({id:p.id,name:p.draft.name,category:p.draft.category,description:p.draft.description,status:formatStatus(p),version:p.published_version})):
    published.map(p=>({id:p.product_id,name:p.content.name,category:p.content.category,description:p.content.description,status:"Publicado",version:p.version}));
  const filtered=current.filter(x=>(category==="all"||x.category===category)&&(status==="all"||(status==="active"?x.status!=="Arquivado":x.status===status))&&(x.name+" "+x.description+" "+x.category).toLowerCase().includes(search.toLowerCase()));
  const displayed=admin?edit:selectedPublication?.content;
  const missing=displayed?libraryMissingFields(displayed.fields,answers):[];
  const load=useCallback(async()=>{
    setLoadError("");
    try {
      if(admin)setDrafts(await listLibraryDrafts());
      else setPublished(await listLibraryPublications());
    }catch(error){setLoadError(errorText(error));}
    finally{setLoading(false);}
  },[admin]);
  useEffect(()=>{setLoading(true);void load();},[load]);
  useEffect(()=>{if(!admin||!selectedDraft||dirty)return;setEdit(selectedDraft.draft);},[admin,selectedDraft?.id,selectedDraft?.revision]); // eslint-disable-line react-hooks/exhaustive-deps

  const open=(id:string)=>{
    const item=drafts.find(p=>p.id===id);
    setSelectedId(id);setSection("info");setAnswers({});
    if(item)setEdit(structuredClone(item.draft));
    setConfirmPublish(false);setConfirmArchive(false);
  };
  const perform=async(task:()=>Promise<void>,success:string)=>{
    setBusy(true);
    try{await task();toast.success(success);await load();}
    catch(error){toast.error(errorText(error));}
    finally{setBusy(false);}
  };
  const create=()=>{if(!user)return;void perform(async()=>{
    const id=await createLibraryDraft(user.id,emptyLibraryDraft());
    // A consulta atualiza a lista de fichas; não abrir usando estado anterior.
    setSelectedId(id);setEdit(emptyLibraryDraft());setSection("info");
    await load();
  },"Rascunho criado.");};
  const update=(patch:Partial<LibraryDraft>)=>{setEdit(old=>({...old,...patch}));setConfirmPublish(false);};
  const save=()=>{if(!selectedDraft||!dirty)return;void perform(async()=>{
    await saveLibraryDraft(selectedDraft,edit);
  },"Rascunho salvo.");};
  const publish=()=>{if(!selectedDraft||dirty||!confirmPublish||validateLibraryDraft(edit).length)return;void perform(async()=>{
    const next=await publishLibraryDraft(selectedDraft);
    setConfirmPublish(false);toast.info("Versão "+next+" criada.");
  },"Produto publicado.");};
  const setField=(id:string,patch:Partial<LibraryField>)=>update({fields:edit.fields.map(f=>f.id===id?{...f,...patch}:f)});
  const addField=()=>update({fields:[...edit.fields,{id:makeId(),label:"Novo campo",type:"text",required:false,when:"always",options:[],visibility:"consultor"}]});
  const addTemplate=(id:string)=>{const template=fieldTemplates.find(f=>f.id===id);if(!template||edit.fields.some(f=>f.id===id))return;update({fields:[...edit.fields,{...template,visibility:"consultor"}]});};
  const addPhoto=()=>{if(!photoTitle.trim()||!/^https:\/\//i.test(photoUrl)){toast.error("Informe título e URL HTTPS da imagem.");return;}const photo:LibraryPhoto={id:makeId(),title:photoTitle.trim(),url:photoUrl.trim(),caption:"",kind:"application",visibility:"consultor"};update({gallery:[...edit.gallery,photo]});setPhotoTitle("");setPhotoUrl("");};
  const sectionsView=()=> {
    if(section==="info")return <div className="space-y-4">
      <div className="space-y-1"><Label>Nome do produto *</Label><Input value={edit.name} onChange={e=>update({name:e.target.value})}/></div>
      <div className="space-y-1"><Label>Categoria *</Label><select className={selectClass} value={edit.category} onChange={e=>update({category:e.target.value})}>{libraryCategories.map(c=><option key={c}>{c}</option>)}</select></div>
      <div className="space-y-1"><Label>Descrição comercial *</Label><Textarea rows={4} value={edit.description} onChange={e=>update({description:e.target.value})}/></div>
      <div className="space-y-1"><Label>Aplicações</Label><Textarea rows={3} value={edit.applications} onChange={e=>update({applications:e.target.value})}/></div>
    </div>;
    if(section==="gallery")return <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Primeira etapa: referências HTTPS. Upload de arquivos, reordenação e armazenamento protegido entrarão na próxima entrega.</p>
      {edit.gallery.map(photo=><div key={photo.id} className="space-y-2 rounded-lg border p-3">
        <div className="flex gap-3">{/^https:\/\//i.test(photo.url)&&<img src={photo.url} alt={photo.title} className="h-16 w-20 rounded object-cover" loading="lazy"/>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{photo.title}</p><p className="break-all text-xs text-muted-foreground">{photo.url}</p></div><Button variant="ghost" size="icon" aria-label={"Remover "+photo.title} onClick={()=>update({gallery:edit.gallery.filter(x=>x.id!==photo.id)})}><Trash2 className="h-4 w-4"/></Button></div>
        <select className={selectClass} value={photo.visibility} onChange={e=>update({gallery:edit.gallery.map(x=>x.id===photo.id?{...x,visibility:e.target.value as LibraryPhoto["visibility"]}:x)})}><option value="consultor">Consultores</option><option value="internal">Somente uso interno</option></select>
      </div>)}
      <Label>Título da imagem</Label><Input value={photoTitle} onChange={e=>setPhotoTitle(e.target.value)} placeholder="Ex.: Instalação em recepção"/>
      <Label>URL HTTPS</Label><Input value={photoUrl} onChange={e=>setPhotoUrl(e.target.value)} placeholder="https://..."/>
      <Button variant="outline" onClick={addPhoto}><Plus className="mr-2 h-4 w-4"/>Adicionar imagem</Button>
    </div>;
    if(section==="fields")return <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Configure os campos conforme as necessidades do produto. Condições fazem referência aos campos de acabamento, instalação e arte vetorial.</p>
      {edit.fields.map(f=><div key={f.id} className="space-y-3 rounded-xl border p-3">
        <div className="flex items-center gap-2"><Input aria-label="Nome do campo" className="flex-1" value={f.label} onChange={e=>setField(f.id,{label:e.target.value})}/><Button variant="ghost" size="icon" aria-label={"Remover "+f.label} onClick={()=>update({fields:edit.fields.filter(x=>x.id!==f.id)})}><Trash2 className="h-4 w-4"/></Button></div>
        <div className="grid grid-cols-2 gap-2">
          <select className={selectClass} value={f.type} onChange={e=>setField(f.id,{type:e.target.value as LibraryField["type"],options:[]})}>{typeOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
          <select className={selectClass} value={f.when} onChange={e=>setField(f.id,{when:e.target.value as LibraryField["when"]})}>{whenOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        </div>
        {(f.type==="select"||f.type==="multi")&&<div className="space-y-1"><Label>Opções (uma por linha)</Label><Textarea rows={3} value={(f.options||[]).join("\n")} onChange={e=>setField(f.id,{options:e.target.value.split("\n").map(v=>v.trim()).filter(Boolean)})}/></div>}
        <Input value={f.help||""} placeholder="Orientação para o consultor" onChange={e=>setField(f.id,{help:e.target.value})}/>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.required} onCheckedChange={v=>setField(f.id,{required:v===true})}/>Obrigatório quando visível</label>
      </div>)}
      <div className="space-y-2 border-t pt-3"><p className="text-sm font-medium">Adicionar campo compartilhado</p><div className="flex flex-wrap gap-2">{fieldTemplates.filter(t=>!edit.fields.some(f=>f.id===t.id)).map(t=><Button key={t.id} variant="outline" size="sm" onClick={()=>addTemplate(t.id)}><Plus className="mr-1 h-3 w-3"/>{t.label}</Button>)}</div></div>
      <Button variant="outline" onClick={addField}><Plus className="mr-2 h-4 w-4"/>Criar campo exclusivo</Button>
    </div>;
    if(section==="addons")return <div className="space-y-3">
      {edit.complements.map(c=><div key={c.id} className="flex items-center gap-2 rounded-lg border p-3">
        <div className="flex-1"><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.visibility==="internal"?"Uso interno":c.mode==="included"?"Incluído no principal":"Linha comercial separada"}</p></div>
        <Button variant="ghost" size="icon" aria-label={"Remover "+c.name} onClick={()=>update({complements:edit.complements.filter(x=>x.id!==c.id)})}><Trash2 className="h-4 w-4"/></Button>
      </div>)}
      <Label>Novo complemento</Label><Input value={addonName} onChange={e=>setAddonName(e.target.value)} placeholder="Ex.: Instalação"/>
      <div className="flex gap-2 flex-wrap"><Button variant="outline" disabled={!addonName.trim()} onClick={()=>{update({complements:[...edit.complements,{id:makeId(),name:addonName.trim(),mode:"separate",visibility:"commercial",when:"always"}]});setAddonName("");}}>Adicionar serviço comercial</Button><Button variant="outline" disabled={!addonName.trim()} onClick={()=>{update({complements:[...edit.complements,{id:makeId(),name:addonName.trim(),mode:"internal",visibility:"internal",when:"always"}]});setAddonName("");}}>Adicionar processo interno</Button></div>
      <p className="text-xs text-muted-foreground">Reutilização global de complementos e agrupamento de instalações serão implementados nas etapas seguintes.</p>
    </div>;
    if(section==="guides")return <div className="space-y-4">
      <div className="space-y-1"><Label>Orientações ao consultor</Label><Textarea rows={5} value={edit.consultant_guidance} onChange={e=>update({consultant_guidance:e.target.value})}/></div>
      <div className="space-y-1"><Label>Orientações internas (não aparecem na Biblioteca Comercial)</Label><Textarea rows={5} value={edit.internal_guidance} onChange={e=>update({internal_guidance:e.target.value})}/></div>
    </div>;
    return <div className="space-y-3 rounded-lg bg-muted p-4"><ShieldCheck className="h-5 w-5 text-muted-foreground"/><h3 className="text-sm font-semibold">Regras e compatibilidades</h3><p className="text-sm text-muted-foreground">As condições simples dos campos já funcionam na prévia. O editor protegido SE → ENTÃO da V23 será incorporado após a implementação das regras compartilhadas no servidor; nenhuma aprovação técnica é simulada.</p></div>;
  };
  if(loading)return <div role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Carregando Biblioteca...</div>;
  return <div className="space-y-5 pb-8">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs text-muted-foreground">EvoluSystem / {admin?"Administração":"Comercial"}</p><h1 className="text-2xl font-semibold tracking-tight">{admin?"Gestão da Biblioteca":"Biblioteca de Produtos"}</h1><p className="mt-1 text-sm text-muted-foreground">{admin?"Cadastro e publicação de produtos para o comercial.":"Encontre produtos e consulte suas configurações publicadas."}</p></div>
      <div className="flex gap-2">{!admin&&isAdmin&&<Button variant="outline" onClick={()=>setLocation("/biblioteca/gestao")}>Administrar</Button>}<Button variant="outline" onClick={()=>{setLoading(true);void load();}}><RefreshCw className="mr-2 h-4 w-4"/>Atualizar</Button>{admin&&<Button onClick={create} disabled={busy}><Plus className="mr-2 h-4 w-4"/>Novo produto</Button>}</div>
    </header>
    {loadError&&<Card><CardContent className="space-y-2 p-4"><p className="text-sm text-destructive">Não foi possível carregar a Biblioteca: {loadError}</p><p className="text-xs text-muted-foreground">A implantação da migration e as permissões do módulo precisam estar concluídas antes do uso.</p></CardContent></Card>}
    {!selectedId?<div className="space-y-4">
      <div className="flex flex-wrap gap-2"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="pl-9" placeholder="Buscar produto..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <select className={selectClass+" max-w-[220px]"} value={category} onChange={e=>setCategory(e.target.value)}><option value="all">Todas as categorias</option>{libraryCategories.map(c=><option key={c}>{c}</option>)}</select>
      {admin&&<select className={selectClass+" max-w-[175px]"} value={status} onChange={e=>setStatus(e.target.value)}><option value="active">Produtos ativos</option><option value="all">Todos</option><option value="Rascunho">Rascunhos</option><option value="Publicado">Publicados</option><option value="Em revisão">Em revisão</option><option value="Arquivado">Arquivados</option></select>}</div>
      <p className="text-xs text-muted-foreground">{filtered.length} produto(s) encontrado(s)</p>
      {filtered.length===0&&<div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum produto encontrado. {admin?"Crie seu primeiro cadastro com Novo produto.":"Os produtos aparecerão após a publicação pela administração."}</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(item=><button type="button" key={item.id} className="rounded-xl border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={()=>open(item.id)}>
        <div className="mb-3 flex h-28 items-center justify-center rounded-lg bg-muted"><Package className="h-9 w-9 text-muted-foreground"/></div>
        <p className="text-xs text-muted-foreground">{item.category}</p><p className="mt-1 font-semibold">{item.name||"Produto sem nome"}</p>
        <p className="mt-1 line-clamp-2 min-h-9 text-xs text-muted-foreground">{item.description||"Descrição pendente"}</p>
        <div className="mt-3 flex items-center justify-between"><Badge variant="secondary">{item.status}</Badge><span className="text-xs text-muted-foreground">{item.version?"v"+item.version:"Rascunho"}</span></div>
      </button>)}</div>
    </div>:<div className="space-y-3">
      <Button variant="ghost" className="px-0" onClick={()=>{if(dirty&&!window.confirm("Descartar alterações não salvas?"))return;setSelectedId(null);setAnswers({});}}><ArrowLeft className="mr-2 h-4 w-4"/>Voltar ao catálogo</Button>
      <div className="grid items-start gap-4 lg:grid-cols-[160px_minmax(0,1fr)_minmax(250px,0.8fr)]">
        <Card><CardContent className="space-y-1 p-2">{admin?sections.map(s=><Button key={s.id} size="sm" variant={section===s.id?"secondary":"ghost"} className="w-full justify-start" onClick={()=>setSection(s.id)}><s.Icon className="mr-2 h-4 w-4"/>{s.name}</Button>):<div className="p-3 text-sm"><ClipboardList className="mb-2 h-5 w-5 text-muted-foreground"/>Ficha publicada v{selectedPublication?.version}</div>}</CardContent></Card>
        <div className="space-y-4">
          <Card><CardHeader className="pb-3"><CardTitle className="text-base">{admin?sections.find(s=>s.id===section)?.name:selectedPublication?.content.name}</CardTitle></CardHeader><CardContent>{admin?sectionsView():<div className="space-y-4">
            <p className="text-sm text-muted-foreground">{selectedPublication?.content.description}</p>
            {selectedPublication?.content.applications&&<p className="text-sm"><strong>Aplicações:</strong> {selectedPublication.content.applications}</p>}
            {selectedPublication?.content.gallery?.length? <div className="grid grid-cols-2 gap-2">{selectedPublication.content.gallery.map(photo=><div key={photo.id}><img src={photo.url} alt={photo.title||"Imagem do produto"} className="aspect-video w-full rounded-lg object-cover" loading="lazy"/><p className="mt-1 text-xs text-muted-foreground">{photo.caption||photo.title}</p></div>)}</div>:<div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Este produto ainda não tem fotos publicadas.</div>}
            {!!selectedPublication?.content.guidance&&<p className="rounded-lg bg-muted p-3 text-sm">{selectedPublication.content.guidance}</p>}
          </div>}</CardContent></Card>
          {admin&&selectedDraft&&<Card><CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{formatStatus(selectedDraft)}</Badge>{dirty&&<Badge variant="secondary">Alterações não salvas</Badge>}</div>
            {validateLibraryDraft(edit).map((e,i)=><p key={i} className="text-xs text-destructive">{e}</p>)}
            <div className="flex flex-wrap gap-2"><Button disabled={!dirty||busy||selectedDraft.status==="archived"} onClick={save}>Salvar rascunho</Button>
            <Button variant="outline" disabled={busy||dirty||selectedDraft.status==="archived"||validateLibraryDraft(edit).length>0} onClick={()=>setConfirmPublish(v=>!v)}>Publicar versão</Button>
            </div>
            {confirmPublish&&<div className="space-y-2 rounded-lg border p-3"><p className="text-sm">Publicar uma nova versão para os consultores? As versões anteriores permanecerão registradas.</p><Button disabled={busy} onClick={publish}><CheckCircle2 className="mr-2 h-4 w-4"/>Confirmar publicação</Button><Button variant="ghost" onClick={()=>setConfirmPublish(false)}>Cancelar</Button></div>}
            {selectedDraft.status==="archived"?<Button variant="outline" disabled={busy} onClick={()=>void perform(()=>restoreLibraryProduct(selectedDraft.id),"Produto restaurado como rascunho.")}><ArchiveRestore className="mr-2 h-4 w-4"/>Restaurar como rascunho</Button>:<Button variant="ghost" disabled={busy||dirty} onClick={()=>setConfirmArchive(true)}><Archive className="mr-2 h-4 w-4"/>Arquivar</Button>}
            {confirmArchive&&<div className="space-y-2 rounded-lg border p-3"><p className="text-sm">Arquivar este produto? Ele não aparecerá mais na Biblioteca Comercial.</p><Button variant="destructive" onClick={()=>void perform(async()=>{await archiveLibraryProduct(selectedDraft.id);setConfirmArchive(false);},"Produto arquivado.")}>Confirmar arquivamento</Button><Button variant="ghost" onClick={()=>setConfirmArchive(false)}>Cancelar</Button></div>}
          </CardContent></Card>}
        </div>
        <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4"/>Prévia do consultor</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">{displayed?.category}</p><p className="font-semibold">{displayed?.name||"Novo produto"}</p><p className="mt-1 text-sm text-muted-foreground">{displayed?.description||"Aguardando descrição."}</p></div>
          {(displayed?.fields||[]).filter(f=>f.visibility!=="internal").map(f=><FieldControl key={f.id} field={f} values={answers} onChange={(id,value)=>setAnswers(old=>({...old,[id]:value}))}/>)}
          {!!missing.length&&<p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Campos pendentes: {missing.join(", ")}.</p>}
          {!missing.length&&!!displayed?.fields.length&&<p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4"/>Campos obrigatórios preenchidos. Isto não equivale à aprovação técnica.</p>}
          {!!displayed?.complements.length&&<div className="space-y-1 border-t pt-3"><p className="text-xs font-semibold">Complementos comerciais</p>{displayed.complements.filter(c=>c.visibility!=="internal").map(c=><p key={c.id} className="text-xs text-muted-foreground">{c.name} · {c.mode==="included"?"Incluído":"Linha separada"}</p>)}</div>}
          <p className="text-xs text-muted-foreground">Preparações multiproduto e transferência assistida ao Conta Azul entram em outra etapa. Esta visualização não gera orçamento.</p>
        </CardContent></Card>
      </div>
    </div>}
  </div>;
}
