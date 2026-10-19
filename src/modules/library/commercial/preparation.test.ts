import { describe, expect, it } from "vitest";
import type { LibraryField, LibraryPublication } from "../model";
import { assessCommercialConfiguration, commercialGroups, copyCommercialText } from "./preparation";

const field=(id:string,label:string,type:LibraryField["type"]="text",required=true,when:LibraryField["when"]="always"):LibraryField=>({id,label,type,required,when,visibility:"consultor"});

const example:LibraryPublication={
  name:"Letreiro em PVC Expandido",category:"Letras e letreiros",description:"Sob medida",
  applications:"",guidance:"",gallery:[],
  fields:[
    field("medidas","Dimensões","dimensions"),
    field("quantidade","Quantidade","number"),
    {...field("acabamento","Acabamento","select"),options:["PVC natural","Pintura personalizada"]},
    field("cor","Cor da pintura","text",true,"paint"),
    field("instalacao","Instalação","yesno"),
    {...field("superficie","Superfície","select",true,"install"),options:["Vidro","Alvenaria"]},
    field("arte_vetorial","Arquivo vetorial","yesno"),
    field("fixacao_especial","Fixação especial","yesno",false,"install"),
    {...field("notas_internas","Custos privados","text"),visibility:"internal"},
  ],
  complements:[
    {id:"i1",name:"Instalação",mode:"separate",when:"install",visibility:"commercial"},
    {id:"a1",name:"Adaptação de arte",mode:"included",when:"noart",visibility:"commercial"},
    {id:"int",name:"Gabarito interno",mode:"internal",when:"always",visibility:"internal"},
  ],
  rules:{photos_policy:"recommend",special_fixing_review:true,conditions:[
    {id:"r1",field:"superficie",equals:"Vidro",action:"technical_review",message:"Validar instalação em vidro"},
    {id:"r2",field:"arte_vetorial",equals:"Não",action:"note",message:"Conferir arte"},
  ]},
};
const values={
  medidas:{width:"180",height:"35"},quantidade:"1",acabamento:"PVC natural",
  instalacao:"Não",arte_vetorial:"Sim",
};

describe("Biblioteca Comercial premium: lógica isolada do layout",()=>{
  it("considera apenas campos comerciais e visíveis na validação",()=>{
    const result=assessCommercialConfiguration(example,values,[],false);
    expect(result.status).toBe("ready");
    expect(result.missing).toEqual([]);
    expect(result.descriptionLines.join(" ")).not.toContain("Custos privados");
    expect(result.visibleFields.some(f=>f.id==="notas_internas")).toBe(false);
  });
  it("exibe cor somente com pintura e superfície somente com instalação",()=>{
    const natural=assessCommercialConfiguration(example,values,[],false);
    expect(natural.visibleFields.some(f=>f.id==="cor")).toBe(false);
    expect(natural.visibleFields.some(f=>f.id==="superficie")).toBe(false);
    const painted=assessCommercialConfiguration(example,{...values,acabamento:"Pintura personalizada",instalacao:"Sim"},[],false);
    expect(painted.missing).toContain("Cor da pintura");
    expect(painted.missing).toContain("Superfície");
  });
  it("bloqueia final por pendência técnica sem permitir autoaprovação",()=>{
    const result=assessCommercialConfiguration(example,{...values,instalacao:"Sim",superficie:"Vidro",fixacao_especial:"Não"},[],false);
    expect(result.status).toBe("technical");
    expect(result.technicalNotes).toContain("Validar instalação em vidro");
    expect(()=>copyCommercialText(example,result,true)).toThrow(/bloqueada/);
    expect(copyCommercialText(example,result,false)).toContain("RASCUNHO PROVISÓRIO");
  });
  it("reconhece fixação especial mesmo sem regra cadastrada",()=>{
    const noRules={...example,rules:{photos_policy:"recommend" as const,special_fixing_review:true as const}};
    const result=assessCommercialConfiguration(noRules,{...values,instalacao:"Sim",superficie:"Alvenaria",fixacao_especial:"Sim"},[],false);
    expect(result.status).toBe("technical");
  });
  it("não inclui complementos inaplicáveis ou internos, nem os duplica",()=>{
    const wrong=assessCommercialConfiguration(example,values,["i1","a1","int"],false);
    expect(wrong.descriptionLines).toHaveLength(1);
    const chosen=assessCommercialConfiguration(example,{...values,instalacao:"Sim",superficie:"Alvenaria",arte_vetorial:"Não"},["i1","i1","a1","int"],false);
    expect(chosen.descriptionLines.filter(x=>x.startsWith("Serviço adicional: Instalação"))).toHaveLength(1);
    expect(chosen.descriptionLines.join(" ")).toContain("Adaptação de arte");
    expect(chosen.descriptionLines.join(" ")).not.toContain("Gabarito interno");
  });
  it("exige confirmação de fotos quando a regra condiciona a instalação",()=>{
    const photoProduct={...example,rules:{photos_policy:"required" as const,special_fixing_review:true as const}};
    const pending=assessCommercialConfiguration(photoProduct,{...values,instalacao:"Sim",superficie:"Alvenaria"},[],false);
    const confirmed=assessCommercialConfiguration(photoProduct,{...values,instalacao:"Sim",superficie:"Alvenaria"},[],true);
    expect(pending.status).toBe("incomplete");
    expect(pending.photosRequired).toBe(true);
    expect(confirmed.status).toBe("ready");
  });
  it("mantém campos de outros produtos em grupo genérico",()=>{
    const group=commercialGroups([...example.fields,field("medida_especial","Medida especial")]);
    expect(group.some(g=>g.key==="other"&&g.fields.some(f=>f.id==="medida_especial"))).toBe(true);
    expect(group.some(g=>g.fields.some(f=>f.id==="notas_internas"))).toBe(false);
  });
  it("não copia instruções internas e informa que não calcula preços",()=>{
    const result=assessCommercialConfiguration(example,values,[],false);
    const copied=copyCommercialText(example,result,true);
    expect(copied).toContain("Conta Azul");
    expect(copied).not.toContain("Custos privados");
    expect(copied).not.toContain("Gabarito interno");
  });
});
