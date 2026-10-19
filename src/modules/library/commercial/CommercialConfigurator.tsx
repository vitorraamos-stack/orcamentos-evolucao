import { AlertTriangle, CheckCircle2, ClipboardCopy, FileText, Layers3, Loader2, Package, Paintbrush, Ruler, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LibraryField, LibraryPublication } from "../model";
import { commercialGroups, type CommercialAssessment, type CommercialValues } from "./preparation";
import { ProductImage } from "./CommercialProductInfo";

const selectClass="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ConfigField({field,value,onChange,missing}:{field:LibraryField;value:unknown;onChange:(id:string,value:unknown)=>void;missing:boolean}) {
  const fieldId=`library-input-${field.id.replace(/[^a-zA-Z0-9-]/g,"-")}`;
  const head=<div className="space-y-1"><Label htmlFor={fieldId} className="text-sm font-medium">{field.label}{field.required?" *":""}</Label>
    {field.help&&<p className="text-[13px] leading-5 text-muted-foreground">{field.help}</p>}</div>;
  let control;
  if(field.type==="dimensions") {
    const dimensions=(value||{}) as Record<string,string>;
    control=<div className="grid grid-cols-2 gap-2">
      {(["width","height"] as const).map((axis)=><div className="space-y-1" key={axis}>
        <Label htmlFor={fieldId+"-"+axis} className="sr-only">{axis==="width"?"Largura":"Altura"} em {field.unit||"cm"}</Label>
        <Input className="h-11 text-[15px] md:text-[15px]" id={fieldId+"-"+axis} type="number" inputMode="decimal" min="0" step="any"
          aria-invalid={missing} placeholder={axis==="width"?"Largura ("+(field.unit||"cm")+")":"Altura ("+(field.unit||"cm")+")"}
          value={dimensions[axis]||""} onChange={e=>onChange(field.id,{...dimensions,[axis]:e.target.value})}/>
      </div>)}
    </div>;
  } else if(field.type==="yesno"){
    control=<select id={fieldId} className={selectClass} aria-invalid={missing} value={String(value||"")} onChange={e=>onChange(field.id,e.target.value)}>
      <option value="">Selecionar...</option><option value="Sim">Sim</option><option value="Não">Não</option>
    </select>;
  } else if(field.type==="select"){
    control=<select id={fieldId} className={selectClass} aria-invalid={missing} value={String(value||"")} onChange={e=>onChange(field.id,e.target.value)}>
      <option value="">Selecionar...</option>{(field.options||[]).map(option=><option key={option} value={option}>{option}</option>)}
    </select>;
  } else if(field.type==="multi"){
    control=<div id={fieldId} className="space-y-2 rounded-lg border border-border/60 p-3">
      {(field.options||[]).map(option=><label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox checked={Array.isArray(value)&&value.includes(option)}
          onCheckedChange={checked=>onChange(field.id,checked?
            [...(Array.isArray(value)?value:[]).filter(x=>x!==option),option]:
            (Array.isArray(value)?value:[]).filter(x=>x!==option))}/>{option}
      </label>)}
    </div>;
  } else if(field.type==="attachment") {
    control=<div className="space-y-1">
      <Input className="h-11 text-[15px] md:text-[15px]" id={fieldId} type="file" onChange={e=>onChange(field.id,!!e.target.files?.length)}/>
      <p className="text-[13px] leading-5 text-muted-foreground">Arquivo selecionado apenas neste preenchimento; não será enviado ou armazenado.</p>
    </div>;
  } else {
    control=<Input className="h-11 text-[15px] md:text-[15px]" id={fieldId} type={field.type==="number"?"number":"text"} inputMode={field.type==="number"?"decimal":undefined}
      min={field.type==="number"?"0":undefined} step={field.type==="number"?"any":undefined}
      placeholder={field.type==="number"?"Ex.: 1":"Preencher..."}
      aria-invalid={missing} value={String(value??"")} onChange={e=>onChange(field.id,e.target.value)}/>;
  }
  return <div className="min-w-0 space-y-2">{head}{control}</div>;
}

const icons={measurements:Ruler,production:Layers3,installation:Wrench,art:FileText,other:Paintbrush};

function GroupHeading({index,title,icon:Icon}:{index:number;title:string;icon:typeof Ruler}) {
  return <div className="flex items-center gap-2 border-b border-border/60 pb-2">
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">{index}</span>
    <Icon className="h-4 w-4 text-primary"/><h3 className="text-base font-semibold">{title}</h3>
  </div>;
}

export default function CommercialConfigurator({
  product,values,onChange,selectedComplements,onSelectedComplements,photosConfirmed,onPhotosConfirmed,assessment,onCopy,coping,
}:{
  product:LibraryPublication;values:CommercialValues;onChange:(id:string,value:unknown)=>void;
  selectedComplements:string[];onSelectedComplements:(ids:string[])=>void;
  photosConfirmed:boolean;onPhotosConfirmed:(value:boolean)=>void;assessment:CommercialAssessment;
  onCopy:(final:boolean)=>void;coping:boolean;
}) {
  const displayPhoto=(product.gallery||[]).filter(photo=>photo.url&&photo.kind!=="process").find(photo=>photo.cover)||
    (product.gallery||[]).find(photo=>photo.url&&photo.kind!=="process");
  const groups=commercialGroups(product.fields||[]);
  const appliedGroups=groups.filter(group=>group.fields.some(f=>assessment.visibleFields.some(v=>v.id===f.id)));
  const renderGroup=(key:string)=>appliedGroups.find(group=>group.key===key);
  const renderFields=(group:typeof groups[number],index:number)=>{
    const Icon=icons[group.key];
    const fields=group.fields.filter(f=>assessment.visibleFields.some(v=>v.id===f.id));
    return <div className="space-y-3" key={group.key}>
      <GroupHeading index={index} title={group.title} icon={Icon}/>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(f=><div key={f.id} className={f.type==="dimensions"||f.type==="multi"||f.type==="attachment"?"sm:col-span-2":undefined}>
          <ConfigField field={f} value={values[f.id]} onChange={onChange} missing={assessment.missing.includes(f.label)}/>
        </div>)}
      </div>
    </div>;
  };
  const visibleAddons=assessment.availableComplements;
  const hasAddons=visibleAddons.length>0;
  let n=0;
  const measurements=renderGroup("measurements");
  const production=renderGroup("production");
  const installation=renderGroup("installation");
  const art=renderGroup("art");
  const other=renderGroup("other");
  const missing=assessment.missing, technical=assessment.technicalNotes;
  const headline=assessment.status==="ready"?"Configuração pronta para descrição final":
    assessment.status==="technical"?"Avaliação técnica necessária":"Configuração incompleta";
  const sectionColor=assessment.status==="ready"?"border-emerald-500/35 bg-emerald-500/5":
    assessment.status==="technical"?"border-amber-500/35 bg-amber-500/5":"border-border bg-muted/35";
  return <section aria-label="Configurar produto" className="min-w-0 space-y-5 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-6 lg:self-start xl:sticky xl:top-4">
    <header className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Layers3 className="h-5 w-5 text-primary"/>Configurar produto</h2>
      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
        {displayPhoto?<ProductImage photo={displayPhoto} alt={displayPhoto.title||product.name} className="h-12 w-14 shrink-0 rounded-lg object-cover"/>:
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Package className="h-6 w-6 text-primary"/></span>}
        <div className="min-w-0"><p className="truncate text-[15px] font-semibold">{product.name}</p><p className="text-[13px] text-muted-foreground">{product.category}</p></div>
        <Badge variant="secondary" className="ml-auto shrink-0 text-[12px]">Individual</Badge>
      </div>
    </header>
    <div className="space-y-6">
      {measurements&&renderFields(measurements,++n)}
      {production&&renderFields(production,++n)}
      {installation&&renderFields(installation,++n)}
      {hasAddons&&<div className="space-y-3">
        <GroupHeading index={++n} title="Complementos" icon={Paintbrush}/>
        <div className="grid gap-2 2xl:grid-cols-2">
          {visibleAddons.map(addon=>{
            const checked=selectedComplements.includes(addon.id);
            return <label key={addon.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition-colors ${checked?"border-primary/60 bg-primary/10":"border-border/70 hover:border-primary/35"}`}>
              <Checkbox className="mt-0.5 shrink-0" checked={checked} onCheckedChange={value=>{
                const next=value?[...selectedComplements.filter(id=>id!==addon.id),addon.id]:selectedComplements.filter(id=>id!==addon.id);
                onSelectedComplements(next);
              }}/>
              <span className="space-y-1"><span className="block text-sm font-medium leading-5">{addon.name}</span><span className="block text-[13px] leading-5 text-muted-foreground">{addon.mode==="included"?"Incluído na descrição principal":"Serviço em linha comercial separada"}</span></span>
            </label>;
          })}
        </div>
      </div>}
      {art&&renderFields(art,++n)}
      {other&&renderFields(other,++n)}
      {assessment.photosRequired&&<div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
        <p className="text-sm font-semibold">Fotografias do local necessárias</p>
        <label className="flex cursor-pointer items-start gap-2 text-sm leading-6">
          <Checkbox className="mt-0.5" checked={photosConfirmed} onCheckedChange={val=>onPhotosConfirmed(val===true)}/>
          Confirmo que recebi as fotografias por outro canal. Os arquivos não ficam anexados nesta preparação.
        </label>
      </div>}
      {assessment.information.map((message,i)=><div key={i} className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">{message}</div>)}
      <div className="space-y-3 border-t border-border/60 pt-5">
        <h3 className="flex items-center gap-2 text-base font-semibold"><FileText className="h-4 w-4 text-primary"/>Resumo comercial</h3>
        <div className="space-y-2 rounded-xl bg-muted/45 p-3 text-[15px] leading-6">
          {assessment.descriptionLines.map((line,i)=><p key={i} className="break-words">{line}</p>)}
        </div>
        <div aria-live="polite" className={`space-y-2 rounded-xl border p-3 ${sectionColor}`}>
          <div className="flex items-start gap-2">
            {assessment.status==="ready"?<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"/>:<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"/>}
            <div className="space-y-1"><p className="text-[15px] font-semibold">{headline}</p>
              <p className="text-[13px] leading-5 text-muted-foreground">{assessment.status==="ready"?"Os dados obrigatórios foram preenchidos e não há bloqueios técnicos identificados.":"O rascunho pode ser copiado, mas a descrição final permanece bloqueada."}</p>
            </div>
          </div>
          {!!missing.length&&<div className="flex flex-wrap gap-1.5">{missing.map((message,i)=><span key={i} className="rounded-full border border-border/70 bg-background/50 px-2 py-1 text-[13px]">{message}</span>)}</div>}
          {!!technical.length&&<div className="space-y-1">{technical.map((message,i)=><p key={i} className="text-sm text-amber-700 dark:text-amber-300">{message}</p>)}</div>}
        </div>
        <div className="grid gap-2 2xl:grid-cols-2">
          <Button type="button" className="min-h-11 text-[15px]" variant="outline" disabled={coping} onClick={()=>onCopy(false)}><ClipboardCopy className="mr-2 h-4 w-4"/>Copiar rascunho</Button>
          <Button type="button" className="min-h-11 text-[15px]" disabled={coping||assessment.status!=="ready"} onClick={()=>onCopy(true)}>
            {coping?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<ClipboardCopy className="mr-2 h-4 w-4"/>}Copiar descrição final
          </Button>
        </div>
        <p className="text-[13px] leading-5 text-muted-foreground">O orçamento oficial continua no Conta Azul. Nenhum preço é calculado aqui.</p>
      </div>
    </div>
  </section>;
}
