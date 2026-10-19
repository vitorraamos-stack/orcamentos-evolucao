import { describe,expect,it } from "vitest";
import { emptyLibraryDraft, libraryFieldVisible, libraryMissingFields, validateLibraryDraft } from "./model";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../../../supabase/migrations/20261016213541_library_v28_individual.sql",import.meta.url),"utf8");
const app=readFileSync(new URL("../../App.tsx",import.meta.url),"utf8");
const page=readFileSync(new URL("./pages/LibraryV28Page.tsx",import.meta.url),"utf8");

describe("Biblioteca V28 individual",()=>{
  it("gera uma única função SQL sem corpo duplicado",()=>{
    expect(migration.match(/create or replace function public\.library_publish_product/g)).toHaveLength(1);
    expect(migration.match(/\$\$;/g)).toHaveLength(1);
    expect(migration).not.toContain("$;))");
    expect(migration.trim().endsWith("$;")).toBe(true);
  });
  it("não introduz projetos ou preparações multiproduto",()=>{
    expect(migration).not.toMatch(/create table public\.library_(projects|project_items|prepared_items)/);
    expect(page).not.toContain("Instalação conjunta");
    expect(app).toContain('import LibraryV28Page from "@/modules/library/pages/LibraryV28Page";');
    expect(app).toContain("<LibraryV28Page management />");
    expect(app).toContain("<LibraryCommercialPage />");
  });
  it("protege as fotografias por produto publicado e permissões",()=>{
    expect(migration).toContain("public=false");
    expect(migration).toContain("library_images_manager_insert");
    expect(migration).toContain("library_images_consultant_select");
    expect(migration).toContain("lp.product_id::text=split_part(name,'/',1)");
    expect(migration).toContain("img.value->>'url'='storage://library-product-images/'||name");
    expect(migration).toContain("'cover',coalesce");
  });
  it("preserva versões de modelos e separa complementos internos",()=>{
    expect(migration).toContain("create table if not exists public.library_config_templates");
    expect(migration).toContain("create table if not exists public.library_complement_catalog");
    expect(migration).toContain("library_complement_visibility_compatible");
    expect(migration).toContain("'visibility'='commercial'");
  });
  it("protege no servidor a exigência de fotos dispensadas",()=>{
    expect(migration).toContain("Justificativa obrigatória para dispensar fotografias.");
    expect(migration).toContain("'special_fixing_review',true");
    expect(migration).toContain("'conditions',v_conditions");
    expect(migration).toContain("Regra condicional possui campo, opção ou ação inválidos.");
    expect(migration).toContain("Acabamento com pintura exige campo de cor obrigatório.");
  });
  it("valida a dispensa de fotografias e o formulário individual",()=>{
    const draft={...emptyLibraryDraft(),name:"Produto exemplo",description:"Descrição adequada",rules:{photos_policy:"waive" as const,waiver_reason:"curto"}};
    expect(validateLibraryDraft(draft)).toContain("Explique a dispensa das fotografias (mínimo 10 caracteres).");
    expect(libraryFieldVisible({id:"cor",label:"Cor",type:"text",required:true,when:"paint"},{acabamento:"PVC natural"})).toBe(false);
    expect(libraryMissingFields([{id:"medidas",label:"Medidas",type:"dimensions",required:true,when:"always"}],{medidas:{width:"120",height:"0"}})).toEqual(["Medidas"]);
  });
  it("impede regras condicionais sem opções e mensagens",()=>{
    const base={...emptyLibraryDraft(),name:"Produto exemplo",description:"Descrição adequada"};
    const choice={id:"acabamento",label:"Acabamento",type:"select" as const,when:"always" as const,required:true,options:["PVC natural","Pintura personalizada"]};
    const bad={...base,fields:[choice],rules:{conditions:[{id:"r1",field:"acabamento",equals:"Acabamento inexistente",action:"note" as const,message:""}]}};
    expect(validateLibraryDraft(bad)).toContain("Regra com opção de comparação inválida.");
    expect(validateLibraryDraft(bad)).toContain("Informe a orientação da regra.");
  });
  it("valida imagens privadas e imagens HTTPS antigas",()=>{
    const base={...emptyLibraryDraft(),name:"Placa Exemplo",description:"Descrição adequada"};
    expect(validateLibraryDraft({...base,gallery:[{id:"a",title:"Frente",caption:"",kind:"application" as const,visibility:"consultor" as const,url:"storage://library-product-images/11111111-1111-4111-8111-111111111111/photo.png"}]})).toEqual([]);
    expect(validateLibraryDraft({...base,gallery:[{id:"b",title:"Privado",caption:"",kind:"process" as const,visibility:"consultor" as const,url:"http://insecure.test/a.png"}]}).some(s=>s.includes("Imagens"))).toBe(true);
  });
});