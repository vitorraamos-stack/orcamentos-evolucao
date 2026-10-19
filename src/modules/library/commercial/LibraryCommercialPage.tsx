import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Package, RefreshCw, Search, Settings2 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import type { LibraryPublishedRecord } from "../model";
import { listLibraryPublications } from "../repository";
import CommercialProductInfo from "./CommercialProductInfo";
import CommercialConfigurator from "./CommercialConfigurator";
import { assessCommercialConfiguration, copyCommercialText } from "./preparation";

const describeError=(error:unknown)=>error instanceof Error?error.message:"Erro ao carregar os produtos.";

export default function LibraryCommercialPage() {
  const {isAdmin}=useAuth();
  const [,navigate]=useLocation();
  const [products,setProducts]=useState<LibraryPublishedRecord[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [loadError,setLoadError]=useState("");
  const [activeId,setActiveId]=useState<string|null>(null);
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("all");
  const [values,setValues]=useState<Record<string,unknown>>({});
  const [selectedComplementIds,setSelectedComplementIds]=useState<string[]>([]);
  const [photosConfirmed,setPhotosConfirmed]=useState(false);
  const [copying,setCopying]=useState(false);

  const reload=useCallback(async()=>{
    try {
      setLoadError("");
      const rows=await listLibraryPublications();
      setProducts(rows);
    } catch(error) {setLoadError(describeError(error));}
    finally {setLoading(false);setRefreshing(false);}
  },[]);
  useEffect(()=>{void reload();},[reload]);
  const selected=products.find(item=>item.product_id===activeId);
  const published=selected?.content;
  const categories=useMemo(()=>Array.from(new Set(products.map(p=>p.content.category).filter(Boolean))).sort(),[products]);
  const filtered=useMemo(()=>products.filter(p=>
    (category==="all"||p.content.category===category)&&
    [p.content.name,p.content.category,p.content.description].join(" ").toLowerCase().includes(query.trim().toLowerCase())
  ),[products,category,query]);
  const assessment=useMemo(()=>published?
    assessCommercialConfiguration(published,values,selectedComplementIds,photosConfirmed):null,
  [published,values,selectedComplementIds,photosConfirmed]);

  const openProduct=(productId:string)=>{
    setActiveId(productId);setValues({});setSelectedComplementIds([]);setPhotosConfirmed(false);
    window.scrollTo({top:0,behavior:"smooth"});
  };
  const back=()=>{
    setActiveId(null);setValues({});setSelectedComplementIds([]);setPhotosConfirmed(false);
  };
  const handleChange=(id:string,value:unknown)=>{
    setValues(old=>{
      const next={...old,[id]:value};
      if(id==="instalacao"&&value!=="Sim") {
        delete next.superficie;delete next.fixacao_especial;
      }
      if(id==="acabamento"&&!String(value).toLowerCase().includes("pintura"))delete next.cor;
      return next;
    });
    if(id==="instalacao"&&value!=="Sim"){
      setPhotosConfirmed(false);
      setSelectedComplementIds(old=>old.filter(key=>
        published?.complements.find(c=>c.id===key)?.when!=="install"
      ));
    }
    if(id==="arte_vetorial"&&value!=="Não") {
      setSelectedComplementIds(old=>old.filter(key=>
        published?.complements.find(c=>c.id===key)?.when!=="noart"
      ));
    }
  };
  const copy=async(final:boolean)=>{
    if(!published||!assessment)return;
    setCopying(true);
    try {
      const text=copyCommercialText(published,assessment,final);
      await navigator.clipboard.writeText(text);
      toast.success(final?"Descrição comercial copiada.":"Rascunho provisório copiado.");
    }catch(error){toast.error(describeError(error));}
    finally{setCopying(false);}
  };
  const refresh=()=>{
    setRefreshing(true);
    void reload();
  };

  return <main className="mx-auto w-full max-w-[1600px] space-y-5 pb-12">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs text-muted-foreground">EvoluSystem / Comercial</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Biblioteca de Produtos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Consulte e configure um produto por vez.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {isAdmin&&<Button variant="outline" onClick={()=>navigate("/biblioteca/gestao")}><Settings2 className="mr-2 h-4 w-4"/>Administrar</Button>}
        <Button variant="outline" onClick={refresh} disabled={refreshing}><RefreshCw className={`mr-2 h-4 w-4 ${refreshing?"animate-spin":""}`}/>Atualizar</Button>
      </div>
    </header>

    {loadError&&<div role="alert" className="rounded-xl border border-destructive/35 bg-destructive/5 p-4 text-sm text-destructive">
      Não foi possível atualizar a Biblioteca: {loadError}
    </div>}

    {loading?<div role="status" className="rounded-xl border p-10 text-center text-sm text-muted-foreground">Carregando produtos publicados...</div>
    :!selected?<section className="space-y-4">
      {activeId&&<p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">O produto selecionado não está mais publicado. Escolha outro no catálogo.</p>}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[210px] flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/>
          <Input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar por produto, categoria ou descrição" className="pl-9" aria-label="Buscar na Biblioteca"/>
        </div>
        <select aria-label="Filtrar categoria" value={category} onChange={event=>setCategory(event.target.value)}
          className="h-10 min-w-[180px] rounded-lg border border-input bg-background px-3 text-sm">
          <option value="all">Todas as categorias</option>{categories.map(name=><option key={name} value={name}>{name}</option>)}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} produto(s) publicados encontrados</p>
      {filtered.length===0?<div className="rounded-xl border border-dashed p-10 text-center">
        <BookOpen className="mx-auto h-8 w-8 text-muted-foreground"/>
        <p className="mt-2 text-sm text-muted-foreground">Nenhum produto publicado corresponde à sua busca.</p>
      </div>:<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map(item=><button key={item.product_id} type="button" onClick={()=>openProduct(item.product_id)}
          className="rounded-2xl border border-border/70 bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex aspect-[16/7] items-center justify-center rounded-xl bg-muted/60"><Package className="h-9 w-9 text-muted-foreground"/></div>
          <p className="mt-4 text-xs text-muted-foreground">{item.content.category}</p>
          <h2 className="mt-1 text-base font-semibold">{item.content.name}</h2>
          <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-muted-foreground">{item.content.description}</p>
          <div className="mt-4 flex items-center justify-between"><Badge variant="secondary">Publicado</Badge>
            <span className="text-xs text-muted-foreground">Versão {item.version}</span></div>
        </button>)}
      </div>}
    </section>:<section className="space-y-4">
      <Button type="button" variant="ghost" onClick={back} className="-ml-2">
        <ArrowLeft className="mr-2 h-4 w-4"/>Voltar ao catálogo
      </Button>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(365px,0.94fr)] 2xl:gap-5">
        <CommercialProductInfo product={selected.content}/>
        {assessment&&<CommercialConfigurator key={selected.product_id}
          product={selected.content} values={values} onChange={handleChange}
          selectedComplements={selectedComplementIds} onSelectedComplements={setSelectedComplementIds}
          photosConfirmed={photosConfirmed} onPhotosConfirmed={setPhotosConfirmed}
          assessment={assessment} onCopy={copy} coping={copying}/>}
      </div>
    </section>}
  </main>;
}
