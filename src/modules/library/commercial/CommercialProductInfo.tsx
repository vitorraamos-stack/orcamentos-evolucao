import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileImage, Image as ImageIcon, Layers3, Maximize2, Paintbrush, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { signedLibraryImageUrl } from "../assets";
import type { LibraryPhoto, LibraryPublication } from "../model";

function ProductImage({photo, alt, className}: {photo: Pick<LibraryPhoto,"url"|"title">;alt:string;className:string}) {
  const [src,setSrc]=useState("");
  useEffect(()=>{
    let mounted=true;
    setSrc("");
    void signedLibraryImageUrl(photo.url).then(url=>{if(mounted)setSrc(url);}).catch(()=>{if(mounted)setSrc("");});
    return()=>{mounted=false;};
  },[photo.url]);
  return src ? <img src={src} alt={alt} loading="lazy" className={className}/> :
    <div role="img" aria-label={alt} className={className+" flex items-center justify-center bg-muted"}>
      <ImageIcon className="h-10 w-10 text-muted-foreground"/>
    </div>;
}

function Feature({icon:Icon,title}:{icon:typeof Layers3;title:string}) {
  return <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/25 px-3 py-3 text-xs font-medium">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4"/></span>
    {title}
  </div>;
}

export default function CommercialProductInfo({product}:{product:LibraryPublication}) {
  const photos=useMemo(()=>{
    const entries=(product.gallery||[]).filter(p=>p.url && p.kind!=="process");
    const cover=entries.findIndex(p=>p.cover===true);
    return cover>0?[entries[cover],...entries.filter((_,i)=>i!==cover)]:entries;
  },[product.gallery]);
  const [active,setActive]=useState(0);
  const [zoom,setZoom]=useState(false);
  useEffect(()=>{setActive(0);setZoom(false);},[product.name,product.gallery]);
  const current=photos[Math.min(active,Math.max(photos.length-1,0))];
  const fieldIds=new Set((product.fields||[]).filter(f=>f.visibility!=="internal").map(f=>f.id));
  const features=[
    {title:product.category,icon:Layers3},
    ...(fieldIds.has("acabamento")?[{title:"Acabamento configurável",icon:Paintbrush}]:[]),
    ...(fieldIds.has("instalacao")?[{title:"Instalação opcional",icon:Wrench}]:[]),
    ...(fieldIds.has("arte_vetorial")?[{title:"Arte vetorial",icon:FileImage}]:[]),
  ];
  const text=product.guidance?.trim() || "";
  const guidance=text.split(/(?:\r?\n|(?<=[.!?])\s+(?=[A-ZÀ-Ú]))/).map(x=>x.trim()).filter(Boolean);
  return <section className="space-y-4">
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(220px,0.94fr)]">
        <div className="min-w-0 space-y-4">
          <Badge variant="secondary" className="font-medium">{product.category}</Badge>
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{product.name}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{product.description}</p>
          </div>
          {product.applications?.trim()&&<div className="space-y-2 border-t border-border/60 pt-4 xl:mt-7">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Layers3 className="h-4 w-4 text-primary"/>Aplicações</h3>
            <p className="text-sm leading-6 text-muted-foreground">{product.applications}</p>
          </div>}
        </div>
        <div className="min-w-0">
          {current?<button className="group relative w-full overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="button" aria-label="Ampliar imagem do produto" onClick={()=>setZoom(true)}>
            <ProductImage photo={current} alt={current.title||product.name} className="aspect-[4/3] w-full rounded-xl object-cover transition-transform duration-300 group-hover:scale-[1.03]"/>
            <span className="absolute bottom-3 right-3 rounded-full bg-background/85 p-2 shadow"><Maximize2 className="h-4 w-4"/></span>
          </button>:<div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-muted/60 text-muted-foreground" role="img" aria-label="Produto sem fotografias publicadas">
            <div className="space-y-2 text-center"><ImageIcon className="mx-auto h-10 w-10"/><p className="text-xs">Sem fotografias publicadas</p></div>
          </div>}
        </div>
      </div>
      {photos.length>1&&<div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Galeria de fotografias">
        {photos.map((photo,index)=><button key={photo.id} type="button" onClick={()=>setActive(index)} aria-label={`Exibir fotografia ${index+1}: ${photo.title||product.name}`} aria-pressed={index===active}
          className={`shrink-0 rounded-lg p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${index===active?"ring-2 ring-primary":"ring-1 ring-border hover:ring-primary/60"}`}>
          <ProductImage photo={photo} alt={photo.title||product.name} className="h-16 w-24 rounded-md object-cover sm:h-20 sm:w-28"/>
        </button>)}
      </div>}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{features.map(x=><Feature key={x.title} {...x}/>)}</div>
    </div>
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-6">
      <h3 className="mb-4 flex items-center gap-2 text-base font-semibold"><FileImage className="h-5 w-5 text-primary"/>Orientações comerciais</h3>
      {guidance.length?<div className="space-y-3">{guidance.map((item,i)=><p key={i} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary"/>{item}
      </p>)}</div>:<p className="text-sm text-muted-foreground">Consulte os campos e orientações do produto antes de preparar a descrição.</p>}
    </div>
    <Dialog open={zoom} onOpenChange={setZoom}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>{current?.title||product.name}</DialogTitle></DialogHeader>
        {current&&<ProductImage photo={current} alt={current.title||product.name} className="max-h-[70vh] w-full rounded-lg object-contain"/>}
        {current?.caption&&<p className="text-sm text-muted-foreground">{current.caption}</p>}
      </DialogContent>
    </Dialog>
  </section>;
}
