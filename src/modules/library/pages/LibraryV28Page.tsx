import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ArrowDown, ArrowLeft, ArrowUp, BookOpen, CheckCircle2, ClipboardCopy, Copy, Eye, FileText, Image as ImageIcon, Images, Layers3, Loader2, LockKeyhole, Package, Plus, RefreshCw, Search, Settings2, ShieldAlert, ShieldCheck, SlidersHorizontal, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { emptyLibraryDraft, libraryCategories, libraryFieldVisible, libraryMissingFields, validateLibraryDraft, type LibraryDraft, type LibraryField, type LibraryPhoto, type LibraryComplement, type LibraryProductRecord, type LibraryPublishedRecord, type LibraryTemplate, type LibraryComplementTemplate, type LibraryPublication } from "../model";
import { archiveLibraryProduct, createLibraryDraft, listLibraryDrafts, listLibraryPublications, publishLibraryDraft, restoreLibraryProduct, saveLibraryDraft } from "../repository";
import { listLibraryTemplates, saveLibraryTemplate, listLibraryComplements, saveLibraryComplement, signedLibraryImageUrl, uploadLibraryPhoto } from "../assets";
import { displayLibraryImageBytes, libraryImageSavings } from "../image-optimization";
import {
  LibraryDraftSaveCoordinator, type LibraryAutoSaveSnapshot,
} from "../draft-autosave";

type Section="info"|"gallery"|"fields"|"addons"|"guides"|"rules";
const sections=[{id:"info" as Section,name:"Informações",Icon:FileText},{id:"gallery" as Section,name:"Galeria",Icon:Images},{id:"fields" as Section,name:"Configuração",Icon:SlidersHorizontal},{id:"addons" as Section,name:"Complementos",Icon:Layers3},{id:"guides" as Section,name:"Orientações",Icon:BookOpen},{id:"rules" as Section,name:"Regras",Icon:ShieldCheck}];
const selectClass="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm";
const errorMessage=(e:unknown)=>e instanceof Error?e.message:"Não foi possível completar a operação.";
const randomId=()=>crypto.randomUUID();
const yesNo=[{value:"",label:"Selecionar..."},{value:"Sim",label:"Sim"},{value:"Não",label:"Não"}];
const modes:[LibraryComplement["mode"],string][]=[["separate","Linha comercial separada"],["included","Incluir na descrição principal"],["internal","Somente produção (interno)"]];
const fieldTypes:[LibraryField["type"],string][]=[["text","Texto"],["number","Número"],["dimensions","Medidas"],["select","Seleção única"],["multi","Múltipla escolha"],["yesno","Sim ou não"],["attachment","Anexo"]];
const fieldWhen:[LibraryField["when"],string][]=[["always","Sempre"],["paint","Acabamento com pintura"],["install","Instalação = Sim"],["noart","Arte vetorial = Não"]];
const builtIns:LibraryTemplate[]=[
  {id:"builtin-letters",name:"Letras e letreiros — padrão",category:"Letras e letreiros",version:1,updated_at:"",fields:[
    {id:"medidas",label:"Dimensões do conjunto",type:"dimensions",when:"always",required:true,unit:"cm"},
    {id:"espessura",label:"Espessura",type:"select",when:"always",required:true,options:["5 mm","10 mm","20 mm"]},
    {id:"acabamento",label:"Acabamento",type:"select",when:"always",required:true,options:["PVC natural","Pintura personalizada"]},
    {id:"cor",label:"Cor da pintura",type:"text",when:"paint",required:true},
    {id:"arte_vetorial",label:"Possui arquivo vetorial?",type:"yesno",when:"always",required:true},
    {id:"instalacao",label:"Necessita instalação?",type:"yesno",when:"always",required:true},
    {id:"superficie",label:"Superfície da instalação",type:"select",when:"install",required:true,options:["Alvenaria","Vidro","Metal","Outra / avaliar"]},
    {id:"fixacao_especial",label:"Fixação especial?",type:"yesno",when:"install",required:false}
  ]},
  {id:"builtin-plates",name:"Placas e fachadas — padrão",category:"Placas e fachadas",version:1,updated_at:"",fields:[
    {id:"medidas",label:"Dimensões",type:"dimensions",when:"always",required:true,unit:"cm"},
    {id:"material",label:"Material",type:"select",when:"always",required:true,options:["ACM","PVC expandido","PS"]},
    {id:"instalacao",label:"Necessita instalação?",type:"yesno",when:"always",required:true},
    {id:"superficie",label:"Superfície da instalação",type:"select",when:"install",required:true,options:["Alvenaria","Vidro","Metal","Outra / avaliar"]},
    {id:"fixacao_especial",label:"Fixação especial?",type:"yesno",when:"install",required:false}
  ]},
  {id:"builtin-stickers",name:"Adesivos e aplicação",category:"Adesivos",version:1,updated_at:"",fields:[
    {id:"medidas",label:"Dimensões",type:"dimensions",when:"always",required:true,unit:"cm"},
    {id:"tipo_adesivo",label:"Tipo de adesivo",type:"select",when:"always",required:true,options:["Branco","Jateado","Perfurado","Transparente"]},
    {id:"instalacao",label:"Necessita instalação?",type:"yesno",when:"always",required:true},
    {id:"superficie",label:"Superfície de aplicação",type:"select",when:"install",required:true,options:["Vidro","Parede","Metal","Outra / avaliar"]}
  ]}
];
function LibraryImage({photo,small=false}:{photo:Pick<LibraryPhoto,"url"|"title"|"caption">;small?:boolean}) {
  const [src,setSrc]=useState("");
  useEffect(()=>{let valid=true;setSrc("");void signedLibraryImageUrl(photo.url).then(x=>{if(valid)setSrc(x);}).catch(()=>{if(valid)setSrc("");});return()=>{valid=false;};},[photo.url]);
  return src?<img alt={photo.title||"Foto do produto"} src={src} loading="lazy" className={small?"h-20 w-24 rounded-lg object-cover":"aspect-video w-full rounded-lg object-cover"}/>:<div className={small?"flex h-20 w-24 items-center justify-center rounded-lg bg-muted":"flex aspect-video w-full items-center justify-center rounded-lg bg-muted"}><ImageIcon className="h-6 w-6 text-muted-foreground"/></div>;
}
function InputField({field,values,onChange}:{field:LibraryField;values:Record<string,unknown>;onChange:(id:string,val:unknown)=>void}) {
  if(!libraryFieldVisible(field,values)||field.visibility==="internal")return null;
  const value=values[field.id];const opts=field.options||[];
  return <div className="space-y-1.5">
    <Label>{field.label}{field.required?" *":""}</Label>
    {!!field.help&&<p className="text-xs text-muted-foreground">{field.help}</p>}
    {field.type==="dimensions"?<div className="grid grid-cols-2 gap-2">{(["width","height"] as const).map(k=><Input key={k} type="number" min={0} aria-label={k==="width"?"Largura":"Altura"} placeholder={k==="width"?"Largura":"Altura"} value={(value as Record<string,string>|undefined)?.[k]||""} onChange={e=>onChange(field.id,{...((value as Record<string,string>)||{}),[k]:e.target.value})}/>)}</div>
    :field.type==="yesno"?<select className={selectClass} value={String(value||"")} onChange={e=>onChange(field.id,e.target.value)}>{yesNo.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select>
    :field.type==="select"?<select className={selectClass} value={opts.includes(String(value||""))?String(value):""} onChange={e=>onChange(field.id,e.target.value)}><option value="">Selecionar...</option>{opts.map(o=><option key={o}>{o}</option>)}</select>
    :field.type==="multi"?<div className="space-y-2 rounded-lg border p-3">{opts.map(o=><label key={o} className="flex items-center gap-2 text-xs"><Checkbox checked={Array.isArray(value)&&value.includes(o)} onCheckedChange={v=>onChange(field.id,v?[...(Array.isArray(value)?value.filter(x=>x!==o):[]),o]:(Array.isArray(value)?value:[]).filter(x=>x!==o))}/>{o}</label>)}</div>
    :field.type==="attachment"?<div className="space-y-1"><Input type="file" onChange={e=>onChange(field.id,!!e.target.files?.length)}/><p className="text-xs text-muted-foreground">Arquivo apenas neste preenchimento; não é enviado nem armazenado.</p></div>
    :<Input type={field.type==="number"?"number":"text"} min={field.type==="number"?0:undefined} value={String(value||"")} onChange={e=>onChange(field.id,e.target.value)}/>}
  </div>;
}
function commercialLines(data:LibraryPublication,values:Record<string,unknown>,selected:string[]):string[] {
  const parts=[data.name];
  for(const f of data.fields){
    if(f.visibility==="internal"||!libraryFieldVisible(f,values))continue;
    const v=values[f.id];if(v==null||v===""||v===false)continue;
    if(f.type==="dimensions"){const d=v as {width?:string;height?:string};if(d.width&&d.height)parts.push(f.label+": "+d.width+" × "+d.height+" "+(f.unit||"cm"));}
    else if(Array.isArray(v))parts.push(f.label+": "+v.join(", "));
    else if(f.type!=="attachment")parts.push(f.label+": "+String(v));
  }
  const additions=(data.complements||[]).filter(x=>selected.includes(x.id) &&
    (x.when==="always" || x.when==="install"&&values.instalacao==="Sim" || x.when==="noart"&&values.arte_vetorial==="Não"));
  for(const c of additions.filter(x=>x.mode==="included"))parts.push(c.name);
  return [parts.join(" — "),...additions.filter(x=>x.mode==="separate").map(c=>"Serviço adicional: "+c.name)];
}
function photoRule(data:LibraryDraft|LibraryPublication):"recommend"|"required"|"waive" {
  if("rules" in data && data.rules){
    if("photos_policy" in data.rules && data.rules.photos_policy)return data.rules.photos_policy;
  }
  return "recommend";
}
export default function LibraryV28Page({management=false}:{management?:boolean}) {
  const {isAdmin,user}=useAuth();
  const [,navigate]=useLocation();
  const admin=management&&isAdmin;
  const [drafts,setDrafts]=useState<LibraryProductRecord[]>([]);
  const [published,setPublished]=useState<LibraryPublishedRecord[]>([]);
  const [templates,setTemplates]=useState<LibraryTemplate[]>([]);
  const [catalog,setCatalog]=useState<LibraryComplementTemplate[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [edit,setEdit]=useState<LibraryDraft>(emptyLibraryDraft);
  const [section,setSection]=useState<Section>("info");
  const [search,setSearch]=useState("");
  const [category,setCategory]=useState("all");
  const [filter,setFilter]=useState("active");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [photoUploading,setPhotoUploading]=useState(false);
  const [error,setError]=useState("");
  const [revisionView,setRevisionView]=useState<"draft"|"published">("draft");
  const [answers,setAnswers]=useState<Record<string,unknown>>({});
  const [chosenComplements,setChosenComplements]=useState<string[]>([]);
  const [photosReceived,setPhotosReceived]=useState(false);
  const [templateId,setTemplateId]=useState("");
  const [templateName,setTemplateName]=useState("");
  const [newComplement,setNewComplement]=useState("");
  const [complementMode,setComplementMode]=useState<LibraryComplement["mode"]>("separate");
  const [history,setHistory]=useState<{version:number;published_at:string}[]>([]);
  const [showHistory,setShowHistory]=useState(false);
  const [confirmation,setConfirmation]=useState<"publish"|"archive"|null>(null);
  const [saveSnapshot,setSaveSnapshot]=useState<LibraryAutoSaveSnapshot>({
    status:"idle",productId:null,dirty:false,revision:null,blocked:false,
  });
  const saveCoordinator=useMemo(()=>new LibraryDraftSaveCoordinator(
    saveLibraryDraft,setSaveSnapshot,
    (record)=>setDrafts(prev=>prev.map(item=>item.id===record.id?record:item))
  ),[]);
  const selected=drafts.find(x=>x.id===selectedId);
  const release=published.find(x=>x.product_id===selectedId);
  const dirty=saveSnapshot.productId===selectedId&&saveSnapshot.dirty;
  const savingDraft=saveSnapshot.status==="saving";
  const saveBlocked=saveSnapshot.blocked;
  const publishedCount=drafts.filter(x=>x.status==="published"&&x.revision===x.published_revision).length;
  const revisionCount=drafts.filter(x=>x.status==="published"&&x.revision>x.published_revision).length;
  const allTemplates=useMemo(()=>[...builtIns,...templates],[templates]);
  const model=allTemplates.find(x=>x.id===templateId);
  const display=admin?(revisionView==="published"&&release?release.content:edit):release?.content;
  const summary=admin?drafts.map(x=>({id:x.id,name:x.draft.name,category:x.draft.category,description:x.draft.description,status:x.status==="archived"?"Arquivado":x.published_version===0?"Rascunho":x.revision>x.published_revision?"Em revisão":"Publicado",version:x.published_version})):
    published.map(x=>({id:x.product_id,name:x.content.name,category:x.content.category,description:x.content.description,status:"Publicado",version:x.version}));
  const cards=summary.filter(x=>(category==="all"||x.category===category)&&(filter==="all"||(filter==="active"?x.status!=="Arquivado":x.status===filter))&&(x.name+" "+x.description+" "+x.category).toLowerCase().includes(search.toLowerCase()));
  const missing=display?libraryMissingFields(display.fields,answers):[];
  const installed=answers.instalacao==="Sim";
  const firedRules=(display?.rules?.conditions||[]).filter(r=>String(answers[r.field]||"")===r.equals);
  const mustHavePhotos=(display?photoRule(display)==="required"&&installed:false)||firedRules.some(r=>r.action==="require_photos");
  const photosPending=mustHavePhotos&&!photosReceived;
  const technicalPending=answers.fixacao_especial==="Sim"||firedRules.some(r=>r.action==="technical_review");
  const canCopyFinal=!admin&&!!release&&missing.length===0&&!photosPending&&!technicalPending;
  const selectedCommercial=(display?.complements||[]).filter(c=>c.mode!=="internal");
  const load=useCallback(async()=>{
    try {
      setError("");
      if(admin){
        const [d,p,t,c]=await Promise.all([listLibraryDrafts(),listLibraryPublications(),listLibraryTemplates(),listLibraryComplements()]);
        setDrafts(d);setPublished(p);setTemplates(t);setCatalog(c);
      }else setPublished(await listLibraryPublications());
    } catch(e){setError(errorMessage(e));}
    finally{setLoading(false);}
  },[admin]);
  useEffect(()=>{setLoading(true);void load();},[load]);
  // Debounce the editor only; publish/archive actions remain deliberate.
  useEffect(()=>{
    if(!admin||!selectedId||saveSnapshot.productId!==selectedId||
       saveSnapshot.status!=="pending"||busy)return;
    const timer=window.setTimeout(()=>{void saveCoordinator.flush();},1000);
    return()=>window.clearTimeout(timer);
  },[admin,selectedId,saveSnapshot,busy,saveCoordinator]);
  useEffect(()=>{
    const onExit=(event:BeforeUnloadEvent)=>{
      if(saveSnapshot.dirty||saveSnapshot.status==="saving"||saveSnapshot.blocked){
        event.preventDefault();event.returnValue="";
      }
    };
    window.addEventListener("beforeunload",onExit);
    return()=>window.removeEventListener("beforeunload",onExit);
  },[saveSnapshot]);
  const perform=async(task:()=>Promise<void>,message:string|(()=>string))=>{
    setBusy(true);
    try{await task();toast.success(typeof message==="function"?message():message);await load();}
    catch(e){toast.error(errorMessage(e));}
    finally{setBusy(false);}
  };
  const open=(id:string)=>{
    if(savingDraft){toast.info("Aguarde a conclusão do salvamento antes de trocar de produto.");return;}
    if((dirty||saveBlocked)&&!window.confirm("Descartar as alterações locais deste produto?"))return;
    if(admin){
      const item=drafts.find(x=>x.id===id);
      if(item){saveCoordinator.select(item);setEdit(structuredClone(item.draft));}
    }
    setSelectedId(id);setSection("info");setAnswers({});setChosenComplements([]);
    setPhotosReceived(false);setConfirmation(null);setRevisionView("draft");setShowHistory(false);
    const t=allTemplates.find(x=>x.category===(drafts.find(x=>x.id===id)?.draft.category||published.find(x=>x.product_id===id)?.content.category));
    setTemplateId(t?.id||"");
  };
  const update=(patch:Partial<LibraryDraft>)=>{
    const next={...edit,...patch};
    saveCoordinator.edit(next);
    setEdit(next);setConfirmation(null);
  };
  const newProduct=()=>{
    if(!user||savingDraft||busy)return;
    if((dirty||saveBlocked)&&!window.confirm("Descartar alterações locais e criar outro produto?"))return;
    void perform(async()=>{
      const draft=emptyLibraryDraft();
      const id=await createLibraryDraft(user.id,draft);
      const all=await listLibraryDrafts();
      const record=all.find(x=>x.id===id);
      if(!record)throw new Error("O novo produto não foi encontrado após o cadastro.");
      setDrafts(all);saveCoordinator.select(record);
      setSelectedId(id);setEdit(structuredClone(record.draft));
      setSection("info");setTemplateId("builtin-letters");setConfirmation(null);
    },"Produto criado como rascunho.");
  };
  const save=()=>{
    if(!selected||!dirty||savingDraft||saveSnapshot.status==="conflict")return;
    void saveCoordinator.flush(true).then(ok=>{
      if(ok)toast.success("Rascunho salvo.");
      else if(saveCoordinator.getError())toast.error(errorMessage(saveCoordinator.getError()));
    });
  };
  const publish=()=>{
    const baseline=saveCoordinator.getBaseline();
    if(!selected||!baseline||dirty||savingDraft||saveBlocked||
       validateLibraryDraft(edit).length||!confirmation)return;
    void perform(async()=>{
      await publishLibraryDraft(baseline);
      setConfirmation(null);setRevisionView("published");
    },"Nova versão publicada.");
  };
  const recoverConflict=async()=>{
    if(!selectedId||!window.confirm("Descartar seu rascunho local e carregar a versão atual?"))return;
    try{
      const records=await listLibraryDrafts();
      const current=records.find(x=>x.id===selectedId);
      if(!current)throw new Error("A ficha não está mais disponível.");
      setDrafts(records);saveCoordinator.acceptServerRecord(current);
      setEdit(structuredClone(current.draft));setConfirmation(null);
      toast.success("Versão atual carregada.");
    }catch(e){toast.error(errorMessage(e));}
  };
  const copyUnsavedDraft=async()=>{
    try{
      await navigator.clipboard.writeText(JSON.stringify(edit,null,2));
      toast.success("Suas alterações locais foram copiadas.");
    }catch{toast.error("Não foi possível copiar o rascunho.");}
  };
  const copy=async(final:boolean)=>{
    if(!display||(!admin&&!release))return;
    const lines=commercialLines(display as LibraryPublication,answers,chosenComplements);
    const prefix=final?"DESCRIÇÃO PARA CONFERÊNCIA E TRANSFERÊNCIA MANUAL AO CONTA AZUL":"RASCUNHO PROVISÓRIO — NÃO LIBERADO PARA TRANSFERÊNCIA FINAL";
    const pendencies=[...missing,...(photosPending?["Fotografias do local"]:[]),...(technicalPending?["Fixação especial depende de parecer técnico"]:[])];
    try{await navigator.clipboard.writeText([prefix,"",...lines,...(pendencies.length?["","Pendências: "+pendencies.join("; ")]:[]),"","Sem preços. A conferência comercial deve ocorrer no Conta Azul."].join("\n"));toast.success("Texto copiado.");}
    catch{toast.error("Não foi possível copiar o texto. Verifique as permissões do navegador.");}
  };
  const fieldPatch=(id:string,patch:Partial<LibraryField>)=>update({fields:edit.fields.map(f=>f.id===id?{...f,...patch}:f)});
  const position=(id:string,dir:number)=>{const a=[...edit.fields],i=a.findIndex(x=>x.id===id),j=i+dir;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];update({fields:a});};
  const positionPhoto=(id:string,dir:number)=>{const a=[...edit.gallery],i=a.findIndex(x=>x.id===id),j=i+dir;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];update({gallery:a});};
  const addField=()=>update({fields:[...edit.fields,{id:randomId(),label:"Novo campo",type:"text",required:false,when:"always",options:[],visibility:"consultor"}]});
  const addTemplate=()=>{if(!model)return;const missingFields=model.fields.filter(f=>!edit.fields.some(x=>x.id===f.id));if(!missingFields.length){toast.info("Todos os campos do modelo já estão presentes.");return;}
    update({fields:[...edit.fields,...structuredClone(missingFields)],source_template:{id:model.id,version:model.version}});toast.success(missingFields.length+" campos incluídos. Suas personalizações atuais foram mantidas.");
  };
  const saveTemplate=()=>{if(!user)return;void perform(async()=>{await saveLibraryTemplate(user.id,templateName,edit.category,edit.fields);setTemplateName("");},"Modelo reutilizável salvo.");};
  const addComplement=(template?:LibraryComplementTemplate)=>{
    if(template){if(edit.complements.some(c=>c.id===template.id)){toast.info("Este complemento já foi adicionado.");return;}
      update({complements:[...edit.complements,{id:template.id,name:template.name,mode:template.mode,visibility:template.visibility,when:template.when}]});return;}
    if(!newComplement.trim())return;const c:LibraryComplement={id:randomId(),name:newComplement.trim(),mode:complementMode,visibility:complementMode==="internal"?"internal":"commercial",when:"always"};
    update({complements:[...edit.complements,c]});setNewComplement("");
  };
  const saveComplement=()=>{if(!user||!newComplement.trim())return;const c:LibraryComplement={id:randomId(),name:newComplement.trim(),mode:complementMode,visibility:complementMode==="internal"?"internal":"commercial",when:"always"};
    void perform(async()=>{await saveLibraryComplement(user.id,c);setNewComplement("");},"Complemento salvo na biblioteca compartilhada.");
  };
  const uploadPhoto=(e:ChangeEvent<HTMLInputElement>)=>{
    const f=e.target.files?.[0];e.target.value="";
    if(!f||!selected||busy)return;
    const productId=selected.id;
    let summary="Imagem enviada ao armazenamento privado.";
    setPhotoUploading(true);
    void perform(async()=>{
      try {
        const {photo,optimization}=await uploadLibraryPhoto(productId,f);
        setEdit(current=>({
          ...current,
          gallery:[...current.gallery,{...photo,cover:current.gallery.length===0}],
        }));
        setConfirmation(null);
        const original=displayLibraryImageBytes(optimization.originalBytes);
        const stored=displayLibraryImageBytes(optimization.storedBytes);
        const saved=libraryImageSavings(optimization.originalBytes,optimization.storedBytes);
        summary=saved>0?`Foto otimizada: ${original} → ${stored} (-${saved}%).`:
          `Foto enviada em ${stored} (o original já estava otimizado).`;
      } finally {
        setPhotoUploading(false);
      }
    },()=>summary+" Salve o rascunho para vincular à ficha.");
  };
  const updatePhoto=(id:string,patch:Partial<LibraryPhoto>)=>update({gallery:edit.gallery.map(f=>f.id===id?{...f,...patch}:f)});
  const loadHistory=()=>{if(!selected)return;void perform(async()=>{
    const {supabase}=await import("@/lib/supabase");
    const {data,error}=await supabase.from("library_product_history").select("version,published_at").eq("product_id",selected.id).order("version",{ascending:false}).limit(25);
    if(error)throw error;setHistory(data||[]);setShowHistory(true);
  },"Histórico carregado.");};
  const editor=()=>{
    if(section==="info")return <div className="space-y-4">
      <div className="space-y-1"><Label>Nome do produto *</Label><Input value={edit.name} onChange={e=>update({name:e.target.value})}/></div>
      <div className="space-y-1"><Label>Categoria *</Label><select className={selectClass} value={edit.category} onChange={e=>{update({category:e.target.value});setTemplateId(allTemplates.find(t=>t.category===e.target.value)?.id||"");}}>{libraryCategories.map(c=><option key={c}>{c}</option>)}</select></div>
      <div className="space-y-1"><Label>Descrição comercial *</Label><Textarea rows={3} value={edit.description} onChange={e=>update({description:e.target.value})}/></div>
      <div className="space-y-1"><Label>Aplicações</Label><Textarea rows={3} value={edit.applications} onChange={e=>update({applications:e.target.value})}/></div>
    </div>;
    if(section==="gallery")return <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Envie fotografias JPG, PNG ou WebP de até 30 MB. O navegador reduz e comprime automaticamente antes do envio (até 1.800 pixels, buscando aproximadamente 500 KB). Somente a versão preparada ocupa espaço na nuvem. As imagens ficam privadas e apenas as publicadas para consultores aparecem no catálogo.</p>
      <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer hover:bg-muted">
        {photoUploading?<Loader2 className="h-4 w-4 animate-spin"/>:<Upload className="h-4 w-4"/>}
        {photoUploading?"Otimizando e enviando...":"Enviar imagem"}
        <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} disabled={busy||selected?.status==="archived"}/>
      </label>
      {edit.gallery.map((photo,i)=><div key={photo.id} className="space-y-2 rounded-lg border p-3">
        <div className="flex items-start gap-3"><LibraryImage photo={photo} small/><div className="min-w-0 flex-1 space-y-1"><Input aria-label="Título da imagem" value={photo.title} onChange={e=>updatePhoto(photo.id,{title:e.target.value})}/><Input aria-label="Legenda da imagem" placeholder="Legenda / texto alternativo" value={photo.caption} onChange={e=>updatePhoto(photo.id,{caption:e.target.value})}/></div></div>
        <div className="flex items-center gap-2 flex-wrap"><select className={selectClass+" flex-1"} value={photo.visibility} onChange={e=>updatePhoto(photo.id,{visibility:e.target.value as LibraryPhoto["visibility"]})}><option value="consultor">Visível ao consultor</option><option value="internal">Somente uso interno</option></select>
        <select aria-label="Tipo de imagem" className={selectClass+" flex-1"} value={photo.kind} onChange={e=>updatePhoto(photo.id,{kind:e.target.value as LibraryPhoto["kind"]})}><option value="application">Aplicação real</option><option value="detail">Detalhe</option><option value="render">Simulação</option><option value="process">Processo interno</option></select></div>
        <div className="flex items-center gap-2 flex-wrap"><Button size="sm" variant={photo.cover?"secondary":"outline"} onClick={()=>update({gallery:edit.gallery.map(p=>({...p,cover:p.id===photo.id}))})}>{photo.cover?"Capa selecionada":"Definir capa"}</Button>
        <Button size="icon" variant="ghost" aria-label="Mover imagem para cima" disabled={i===0} onClick={()=>positionPhoto(photo.id,-1)}><ArrowUp className="h-4 w-4"/></Button><Button size="icon" variant="ghost" aria-label="Mover imagem para baixo" disabled={i===edit.gallery.length-1} onClick={()=>positionPhoto(photo.id,1)}><ArrowDown className="h-4 w-4"/></Button>
        <Button size="icon" variant="ghost" aria-label="Remover imagem da ficha" onClick={()=>update({gallery:edit.gallery.filter(x=>x.id!==photo.id)})}><Trash2 className="h-4 w-4"/></Button></div>
      </div>)}
      {!edit.gallery.length&&<p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Ainda não há imagens nesta ficha.</p>}
      <p className="text-xs text-muted-foreground">Remover uma imagem da ficha não exclui o arquivo físico imediatamente. Os arquivos permanecem privados.</p>
    </div>;
    if(section==="fields")return <div className="space-y-4">
      <div className="space-y-2 rounded-xl bg-muted/60 p-3"><p className="text-sm font-semibold">Começar com um modelo</p>
        <select className={selectClass} value={templateId} onChange={e=>setTemplateId(e.target.value)}>
          <option value="">Selecionar modelo...</option>{allTemplates.filter(t=>t.category===edit.category).map(t=><option key={t.id} value={t.id}>{t.name} · v{t.version}</option>)}
        </select>
        <Button size="sm" variant="outline" disabled={!model} onClick={addTemplate}>Aplicar campos ausentes</Button>
        <p className="text-xs text-muted-foreground">As personalizações já feitas não serão sobrescritas. Cada produto mantém a cópia dos campos utilizados.</p>
      </div>
      {edit.fields.map((f,i)=><div key={f.id} className="space-y-3 rounded-xl border p-3">
        <div className="flex gap-2"><Input aria-label="Nome do campo" className="min-w-0 flex-1" value={f.label} onChange={e=>fieldPatch(f.id,{label:e.target.value})}/><Button variant="ghost" size="icon" aria-label="Remover campo" onClick={()=>update({fields:edit.fields.filter(x=>x.id!==f.id)})}><Trash2 className="h-4 w-4"/></Button></div>
        <div className="grid grid-cols-2 gap-2"><select aria-label="Tipo" className={selectClass} value={f.type} onChange={e=>fieldPatch(f.id,{type:e.target.value as LibraryField["type"],options:[]})}>{fieldTypes.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>
        <select aria-label="Quando aparece" className={selectClass} value={f.when} onChange={e=>fieldPatch(f.id,{when:e.target.value as LibraryField["when"]})}>{fieldWhen.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></div>
        {(f.type==="select"||f.type==="multi")&&<div><Label>Opções (uma por linha)</Label><Textarea rows={3} value={(f.options||[]).join("\n")} onChange={e=>fieldPatch(f.id,{options:e.target.value.split("\n").map(x=>x.trim()).filter(Boolean)})}/></div>}
        <Input placeholder="Instrução para o consultor" value={f.help||""} onChange={e=>fieldPatch(f.id,{help:e.target.value})}/>
        <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-xs"><Checkbox checked={f.required} onCheckedChange={x=>fieldPatch(f.id,{required:x===true})}/>Obrigatório quando aparecer</label>
        <label className="flex items-center gap-2 text-xs"><Checkbox checked={f.visibility!=="internal"} onCheckedChange={x=>fieldPatch(f.id,{visibility:x?"consultor":"internal"})}/>Visível ao consultor</label>
        <div className="flex gap-1"><Button size="icon" variant="ghost" aria-label="Subir campo" disabled={i===0} onClick={()=>position(f.id,-1)}><ArrowUp className="h-4 w-4"/></Button><Button size="icon" variant="ghost" aria-label="Descer campo" disabled={i===edit.fields.length-1} onClick={()=>position(f.id,1)}><ArrowDown className="h-4 w-4"/></Button></div></div>
      </div>)}
      <Button variant="outline" onClick={addField}><Plus className="mr-2 h-4 w-4"/>Novo campo personalizado</Button>
      <div className="space-y-2 border-t pt-4"><p className="text-sm font-semibold">Guardar estes campos como modelo</p><Input placeholder="Nome do modelo reutilizável" value={templateName} onChange={e=>setTemplateName(e.target.value)}/><Button size="sm" variant="secondary" disabled={busy||!templateName.trim()||!edit.fields.length} onClick={saveTemplate}>Salvar modelo compartilhado</Button></div>
    </div>;
    if(section==="addons")return <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Complementos podem gerar uma linha comercial, integrar a descrição principal ou ser exclusivamente internos.</p>
      {edit.complements.map(c=><div key={c.id} className="space-y-2 rounded-xl border p-3"><div className="flex items-center gap-2"><Input aria-label="Nome do complemento" value={c.name} onChange={e=>update({complements:edit.complements.map(x=>x.id===c.id?{...x,name:e.target.value}:x)})}/><Button variant="ghost" size="icon" aria-label="Remover complemento" onClick={()=>update({complements:edit.complements.filter(x=>x.id!==c.id)})}><Trash2 className="h-4 w-4"/></Button></div>
      <div className="grid grid-cols-2 gap-2"><select className={selectClass} value={c.mode} onChange={e=>{const mode=e.target.value as LibraryComplement["mode"];update({complements:edit.complements.map(x=>x.id===c.id?{...x,mode,visibility:mode==="internal"?"internal":"commercial"}:x)})}}>{modes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      <select className={selectClass} value={c.when} onChange={e=>update({complements:edit.complements.map(x=>x.id===c.id?{...x,when:e.target.value as LibraryComplement["when"]}:x)})}><option value="always">Sempre</option><option value="install">Com instalação</option><option value="noart">Sem arte vetorial</option></select></div></div>)}
      <div className="rounded-xl bg-muted/60 p-3 space-y-2"><p className="text-sm font-semibold">Reutilizar complemento</p>
        {catalog.length?catalog.map(c=><div key={c.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate">{c.name}</span><Button variant="outline" size="sm" disabled={edit.complements.some(x=>x.id===c.id)} onClick={()=>addComplement(c)}>Adicionar</Button></div>):<p className="text-xs text-muted-foreground">Sem complementos compartilhados cadastrados.</p>}
      </div>
      <div className="space-y-2 border-t pt-3"><Label>Novo complemento</Label><Input value={newComplement} onChange={e=>setNewComplement(e.target.value)} placeholder="Ex.: Criação de arte"/>
        <select className={selectClass} value={complementMode} onChange={e=>setComplementMode(e.target.value as LibraryComplement["mode"])}>{modes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!newComplement.trim()} onClick={()=>addComplement()}>Adicionar apenas nesta ficha</Button><Button size="sm" variant="secondary" disabled={!newComplement.trim()||busy} onClick={saveComplement}>Salvar na biblioteca compartilhada</Button></div>
      </div>
    </div>;
    if(section==="guides")return <div className="space-y-4"><div><Label>Orientações para o consultor</Label><Textarea rows={5} value={edit.consultant_guidance} onChange={e=>update({consultant_guidance:e.target.value})}/></div><div><Label>Orientações internas da produção</Label><Textarea rows={5} value={edit.internal_guidance} onChange={e=>update({internal_guidance:e.target.value})}/><p className="mt-1 text-xs text-muted-foreground">Dados internos não são incluídos nas publicações comerciais.</p></div></div>;
    return <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Configure as orientações sobre fotografias do local. As exigências essenciais de cor e superfície são protegidas pelo servidor.</p>
      <div className="rounded-lg bg-muted/60 p-3 space-y-2"><Label>Fotografias quando houver instalação</Label><select className={selectClass} value={edit.rules?.photos_policy||"recommend"} onChange={e=>update({rules:{...edit.rules,photos_policy:e.target.value as "recommend"|"required"|"waive"}})}><option value="recommend">Recomendar</option><option value="required">Tornar obrigatórias</option><option value="waive">Dispensar com justificativa</option></select></div>
      {edit.rules?.photos_policy==="waive"&&<div><Label>Justificativa da dispensa *</Label><Textarea rows={3} value={edit.rules.waiver_reason||""} onChange={e=>update({rules:{...edit.rules,waiver_reason:e.target.value}})}/></div>}
      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-semibold">Condições SE → ENTÃO</p>
        <p className="text-xs text-muted-foreground">Crie avisos, solicite fotografias ou marque avaliação técnica conforme uma resposta do consultor.</p>
        {(edit.rules?.conditions||[]).map(rule=>{
          const controller=edit.fields.find(f=>f.id===rule.field);
          const options=controller?.type==="yesno"?["Sim","Não"]:(controller?.options||[]);
          return <div className="space-y-2 rounded-lg border p-3" key={rule.id}>
            <Label>Se o campo...</Label>
            <select className={selectClass} value={rule.field} onChange={e=>{
              const f=edit.fields.find(x=>x.id===e.target.value);
              const first=f?.type==="yesno"?"Sim":f?.options?.[0]||"";
              update({rules:{...edit.rules,conditions:(edit.rules?.conditions||[]).map(x=>x.id===rule.id?{...x,field:e.target.value,equals:first}:x)}});
            }}>{edit.fields.filter(f=>f.visibility!=="internal"&&["yesno","select"].includes(f.type)).map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select>
            <Label>For igual a...</Label>
            <select className={selectClass} value={rule.equals} onChange={e=>update({rules:{...edit.rules,conditions:(edit.rules?.conditions||[]).map(x=>x.id===rule.id?{...x,equals:e.target.value}:x)}})}>{options.map(opt=><option key={opt} value={opt}>{opt}</option>)}</select>
            <Label>Então...</Label>
            <select className={selectClass} value={rule.action} onChange={e=>update({rules:{...edit.rules,conditions:(edit.rules?.conditions||[]).map(x=>x.id===rule.id?{...x,action:e.target.value as typeof rule.action}:x)}})}><option value="note">Mostrar orientação</option><option value="require_photos">Exigir fotografias</option><option value="technical_review">Indicar avaliação técnica necessária</option></select>
            {rule.action==="note"&&<Input placeholder="Escreva a orientação..." value={rule.message} onChange={e=>update({rules:{...edit.rules,conditions:(edit.rules?.conditions||[]).map(x=>x.id===rule.id?{...x,message:e.target.value}:x)}})}/>}
            <Button variant="ghost" size="sm" onClick={()=>update({rules:{...edit.rules,conditions:(edit.rules?.conditions||[]).filter(x=>x.id!==rule.id)}})}><Trash2 className="mr-1 h-4 w-4"/> Remover regra</Button>
          </div>;
        })}
        <Button variant="outline" size="sm" disabled={!edit.fields.some(f=>f.visibility!=="internal"&&["yesno","select"].includes(f.type))} onClick={()=>{
          const f=edit.fields.find(x=>x.visibility!=="internal"&&["yesno","select"].includes(x.type));
          if(!f)return;
          const equals=f.type==="yesno"?"Sim":f.options?.[0]||"";
          update({rules:{...edit.rules,conditions:[...(edit.rules?.conditions||[]),{id:randomId(),field:f.id,equals,action:"note",message:""}]}});
        }}><Plus className="mr-1 h-4 w-4"/>Adicionar condição</Button>
      </div>
      <div className="rounded-lg border p-3 space-y-2"><div className="flex gap-2"><LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground"/><p className="text-sm font-semibold">Regras técnicas protegidas</p></div>
      <p className="text-xs text-muted-foreground">Se houver instalação, a superfície é obrigatória. Se houver pintura, a cor é obrigatória. Fixação especial indica avaliação técnica necessária e impede a cópia como configuração liberada.</p></div>
      <p className="text-xs text-muted-foreground">Este fluxo não cria acompanhamentos de parecer técnico nem atribui tarefas automaticamente.</p>
    </div>;
  };
  if(loading)return <div role="status" className="flex min-h-44 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/> Carregando Biblioteca...</div>;
  return <div className="space-y-5 pb-10">
    <header className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-muted-foreground">EvoluSystem / {admin?"Administração":"Comercial"}</p><h1 className="text-2xl font-semibold tracking-tight">{admin?"Gestão da Biblioteca":"Biblioteca de Produtos"}</h1><p className="mt-1 text-sm text-muted-foreground">{admin?"Gerencie as fichas individualmente.":"Consulte e configure um produto por vez."}</p></div>
      <div className="flex gap-2 flex-wrap">{!admin&&isAdmin&&<Button variant="outline" onClick={()=>navigate("/biblioteca/gestao")}>Administrar</Button>}<Button variant="outline" disabled={busy} onClick={()=>{setLoading(true);void load();}}><RefreshCw className="mr-2 h-4 w-4"/>Atualizar</Button>{admin&&<Button onClick={newProduct} disabled={busy||savingDraft}><Plus className="mr-2 h-4 w-4"/>Novo produto</Button>}</div></header>
    {!!error&&<Card><CardContent className="p-4 text-sm text-destructive">Não foi possível carregar os dados: {error}</CardContent></Card>}
    {!selectedId?<div className="space-y-4">
      {admin&&<div className="grid grid-cols-3 gap-2">{[{label:"Publicados",value:publishedCount},{label:"Em revisão",value:revisionCount},{label:"Rascunhos",value:drafts.filter(x=>!x.published_version&&x.status!=="archived").length}].map(x=><div key={x.label} className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{x.label}</p><p className="mt-1 text-xl font-semibold">{x.value}</p></div>)}</div>}
      <div className="flex flex-wrap gap-2"><div className="relative min-w-[190px] flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="pl-9" placeholder="Buscar produto..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <select className={selectClass+" max-w-[190px]"} value={category} onChange={e=>setCategory(e.target.value)}><option value="all">Todas as categorias</option>{libraryCategories.map(c=><option key={c}>{c}</option>)}</select>
      {admin&&<select className={selectClass+" max-w-[175px]"} value={filter} onChange={e=>setFilter(e.target.value)}><option value="active">Produtos ativos</option><option value="all">Todos</option>{["Rascunho","Publicado","Em revisão","Arquivado"].map(x=><option key={x}>{x}</option>)}</select>}</div>
      <p className="text-xs text-muted-foreground">{cards.length} produtos encontrados</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(p=><button key={p.id} type="button" onClick={()=>open(p.id)} className="space-y-2 rounded-xl border bg-card p-4 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex aspect-[3/1] items-center justify-center rounded-lg bg-muted"><Package className="h-7 w-7 text-muted-foreground"/></div><p className="text-xs text-muted-foreground">{p.category}</p><p className="font-semibold">{p.name||"Produto sem nome"}</p><p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">{p.description||"Descrição ainda não cadastrada."}</p><div className="flex items-center justify-between"><Badge variant="secondary">{p.status}</Badge><span className="text-xs text-muted-foreground">{p.version?"v"+p.version:"Rascunho"}</span></div>
      </button>)}</div>
      {!cards.length&&<div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum produto encontrado para os filtros selecionados.</div>}
    </div>:<div className="space-y-3">
      <Button variant="ghost" className="px-0" onClick={()=>{
        if(savingDraft){toast.info("Aguarde o salvamento terminar.");return;}
        if((dirty||saveBlocked)&&!window.confirm("Descartar alterações locais?"))return;
        saveCoordinator.select(null);setSelectedId(null);setAnswers({});setConfirmation(null);
      }}><ArrowLeft className="mr-2 h-4 w-4"/>Voltar ao catálogo</Button>
      <div className="grid items-start gap-4 lg:grid-cols-[165px_minmax(0,1fr)_minmax(240px,0.8fr)]">
        <Card><CardContent className="p-2">{admin?<div className="space-y-1">{sections.map(s=><Button key={s.id} variant={section===s.id?"secondary":"ghost"} size="sm" className="w-full justify-start" onClick={()=>setSection(s.id)}><s.Icon className="mr-2 h-4 w-4"/>{s.name}</Button>)}</div>:<div className="p-2 space-y-2"><p className="text-xs text-muted-foreground">Ficha publicada v{release?.version}</p><p className="text-sm font-medium">{release?.content.category}</p></div>}</CardContent></Card>
        <div className="space-y-4"><Card><CardHeader className="pb-3"><CardTitle className="text-base">{admin?sections.find(s=>s.id===section)?.name:release?.content.name}</CardTitle></CardHeader>
          <CardContent className="space-y-4">{admin?editor():<div className="space-y-4">
            <p className="text-sm">{release?.content.description}</p>
            {!!release?.content.applications&&<p className="text-sm"><strong>Aplicações:</strong> {release.content.applications}</p>}
            {release?.content.gallery?.length?<div className="grid grid-cols-2 gap-2">{release.content.gallery.map(p=><div key={p.id}><LibraryImage photo={p}/><p className="mt-1 text-xs text-muted-foreground">{p.caption||p.title}</p></div>)}</div>:<p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Nenhuma foto comercial publicada ainda.</p>}
            {!!release?.content.guidance&&<div className="rounded-lg bg-muted p-3 text-sm"><strong>Orientações:</strong> {release.content.guidance}</div>}
          </div>}</CardContent></Card>
          {admin&&selected&&<Card><CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 flex-wrap"><Badge variant="outline">{selected.status==="archived"?"Arquivado":selected.published_version===0?"Rascunho":selected.revision>selected.published_revision?"Em revisão":"Publicado"}</Badge>{dirty&&<Badge variant="secondary">Alterações locais</Badge>}
              <Badge variant="outline" role="status">
                {saveSnapshot.status==="saving"?"Salvando…":
                 saveSnapshot.status==="pending"?"Salvamento automático pendente":
                 saveSnapshot.status==="conflict"?"Conflito de edição":
                 saveSnapshot.status==="error"?"Erro no salvamento":
                 saveSnapshot.status==="saved"?"Alterações salvas":"Aguardando"}
              </Badge></div>
            {validateLibraryDraft(edit).map((e,i)=><p key={i} className="text-xs text-destructive">{e}</p>)}
            {saveBlocked&&<div className="space-y-2 rounded-lg border p-3 text-sm" role="alert">
              <p className="font-medium">{saveSnapshot.status==="conflict"?"Outra pessoa atualizou esta ficha.":"O salvamento não foi concluído."}</p>
              <p className="text-xs text-muted-foreground">Seu texto permanece nesta tela. O sistema não fará novas gravações automaticamente até você decidir.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={()=>void copyUnsavedDraft()}>Copiar minhas alterações</Button>
                {saveSnapshot.status==="error"&&<Button size="sm" disabled={busy} onClick={save}>Tentar salvar novamente</Button>}
                <Button variant="outline" size="sm" disabled={busy} onClick={()=>void recoverConflict()}>Descartar e carregar versão atual</Button>
              </div>
            </div>}
            <div className="flex flex-wrap gap-2">
              <Button disabled={!dirty||busy||savingDraft||saveSnapshot.status==="conflict"||selected.status==="archived"} onClick={save}>Salvar agora</Button>
              <Button variant="outline" disabled={busy||dirty||savingDraft||saveBlocked||selected.status==="archived"||validateLibraryDraft(edit).length>0||(selected.published_version>0&&selected.revision===selected.published_revision)} onClick={()=>setConfirmation("publish")}>Publicar versão</Button>
            </div>
            {confirmation==="publish"&&<div className="space-y-2 rounded-lg border p-3"><p className="text-sm">Confirmar publicação desta ficha? O histórico anterior será preservado.</p><Button disabled={busy||dirty||savingDraft||saveBlocked} onClick={publish}>Confirmar publicação</Button><Button variant="ghost" onClick={()=>setConfirmation(null)}>Cancelar</Button></div>}
            {selected.status==="archived"?<Button variant="outline" disabled={busy} onClick={()=>void perform(()=>restoreLibraryProduct(selected.id),"Produto restaurado como rascunho.")}><ArchiveRestore className="mr-2 h-4 w-4"/>Restaurar</Button>:<Button variant="ghost" disabled={dirty||busy||savingDraft||saveBlocked} onClick={()=>setConfirmation("archive")}><Archive className="mr-2 h-4 w-4"/>Arquivar</Button>}
            {confirmation==="archive"&&<div className="rounded-lg border p-3 space-y-2"><p className="text-sm">Arquivar e retirar do catálogo comercial?</p><Button variant="destructive" onClick={()=>void perform(async()=>{await archiveLibraryProduct(selected.id);setConfirmation(null);},"Produto arquivado.")}>Confirmar</Button><Button variant="ghost" onClick={()=>setConfirmation(null)}>Cancelar</Button></div>}
            <Button variant="link" className="px-0" onClick={loadHistory}>Histórico de publicações</Button>
            {showHistory&&<div className="space-y-1 border-t pt-2">{history.length?history.map(x=><p className="text-xs text-muted-foreground" key={x.version}>Versão {x.version} · {new Date(x.published_at).toLocaleDateString("pt-BR")}</p>):<p className="text-xs text-muted-foreground">Nenhuma publicação anterior.</p>}</div>}
            <Button variant="ghost" size="sm" onClick={()=>{if(!user||savingDraft||busy)return;if((dirty||saveBlocked)&&!window.confirm("Duplicar e sair deste rascunho?"))return;const clone={...structuredClone(edit),name:"Cópia de "+edit.name,gallery:[]};void perform(async()=>{const id=await createLibraryDraft(user.id,clone);const all=await listLibraryDrafts();const row=all.find(x=>x.id===id);if(!row)throw new Error("Cópia não encontrada.");setDrafts(all);saveCoordinator.select(row);setSelectedId(id);setEdit(structuredClone(row.draft));},"Cópia criada como rascunho, sem copiar arquivos da galeria.");}}><Copy className="mr-2 h-4 w-4"/>Duplicar produto</Button>
          </CardContent></Card>}
        </div>
        <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Eye className="h-4 w-4"/> {admin?"Prévia do consultor":"Configurar produto"}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {admin&&<div className="flex gap-2"><Button size="sm" variant={revisionView==="draft"?"secondary":"ghost"} onClick={()=>{setRevisionView("draft");setAnswers({});}}>Em edição</Button><Button size="sm" variant={revisionView==="published"?"secondary":"ghost"} disabled={!release} onClick={()=>{setRevisionView("published");setAnswers({});}}>Publicado</Button></div>}
            <div className="rounded-lg bg-muted p-3 space-y-1"><p className="text-xs text-muted-foreground">{display?.category}</p><p className="font-semibold">{display?.name||"Novo produto"}</p><p className="text-xs text-muted-foreground">{display?.description||"Aguardando descrição."}</p></div>
            {(display?.fields||[]).map(f=><InputField key={f.id} field={f} values={answers} onChange={(id,val)=>setAnswers(old=>{const next={...old,[id]:val};if(id==="instalacao"&&val!=="Sim"){delete next.superficie;delete next.fixacao_especial;setPhotosReceived(false);}if(id==="acabamento"&&!String(val).toLowerCase().includes("pintura"))delete next.cor;return next;})}/>)}
            {(installed&&photoRule(display||emptyLibraryDraft())!=="waive"||firedRules.some(r=>r.action==="require_photos"))&&<div className="space-y-2 rounded-lg bg-muted/60 p-3"><p className="text-xs font-medium">{mustHavePhotos?"Fotografias do local obrigatórias":"Fotografias do local recomendadas"}</p><label className="flex items-start gap-2 text-xs"><Checkbox checked={photosReceived} onCheckedChange={x=>setPhotosReceived(x===true)}/>Confirmo que o cliente forneceu fotografias do local</label></div>}
            {!!missing.length&&<p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Preencher: {missing.join(", ")}.</p>}
            {firedRules.filter(r=>r.action==="note").map(r=><p key={r.id} className="rounded-lg bg-muted p-3 text-xs">{r.message}</p>)}
            {photosPending&&<p className="text-xs text-muted-foreground">Fotografias pendentes para esta configuração.</p>}
            {technicalPending&&<div className="flex items-start gap-2 rounded-lg bg-muted p-3"><ShieldAlert className="h-4 w-4 shrink-0"/><p className="text-xs">Fixação especial: avaliação técnica necessária. Pode copiar como rascunho provisório, sem liberação final.</p></div>}
            {selectedCommercial.length>0&&<div className="space-y-2 border-t pt-3"><p className="text-sm font-semibold">Complementos</p>{selectedCommercial.filter(c=>c.when==="always"||c.when==="install"&&installed||c.when==="noart"&&answers.arte_vetorial==="Não").map(c=><label key={c.id} className="flex items-start gap-2 text-xs"><Checkbox checked={chosenComplements.includes(c.id)} onCheckedChange={x=>setChosenComplements(old=>x?[...old.filter(z=>z!==c.id),c.id]:old.filter(z=>z!==c.id))}/><span>{c.name}<span className="block text-muted-foreground">{c.mode==="included"?"Incluído na descrição":"Linha comercial separada"}</span></span></label>)}</div>}
            {!admin&&<div className="space-y-2 border-t pt-3"><Button variant="outline" className="w-full" onClick={()=>void copy(false)}><ClipboardCopy className="mr-2 h-4 w-4"/>Copiar rascunho provisório</Button><Button className="w-full" disabled={!canCopyFinal} onClick={()=>void copy(true)}><ClipboardCopy className="mr-2 h-4 w-4"/>Copiar descrição final</Button><p className="text-xs text-muted-foreground">O orçamento oficial continua no Conta Azul. Nenhum preço é calculado aqui.</p></div>}
            {admin&&<p className="text-xs text-muted-foreground">Esta prévia não publica dados automaticamente. Salve e publique a ficha quando estiver pronta.</p>}
          </CardContent></Card>
      </div>
    </div>}
  </div>;
}
