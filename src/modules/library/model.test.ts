import { describe, it, expect } from "vitest";
import { emptyLibraryDraft, libraryFieldVisible, libraryMissingFields, validateLibraryDraft, type LibraryField } from "./model";

const required = (id:string, type:LibraryField["type"], when:LibraryField["when"]="always"):LibraryField => ({
  id,label:id,type,required:true,when
});

describe("Biblioteca: regras base do configurador",()=>{
  it("não libera a publicação de fichas vazias",()=>{
    expect(validateLibraryDraft(emptyLibraryDraft()).length).toBeGreaterThan(0);
  });
  it("oculta dados dependentes quando a condição não existe",()=>{
    expect(libraryFieldVisible(required("cor","text","paint"),{acabamento:"PVC natural"})).toBe(false);
    expect(libraryFieldVisible(required("cor","text","paint"),{acabamento:"Pintura personalizada"})).toBe(true);
    expect(libraryFieldVisible(required("surface","text","install"),{instalacao:"Não"})).toBe(false);
  });
  it("exige somente os campos visíveis e obrigatórios",()=>{
    const fields=[required("medidas","dimensions"),required("surface","text","install")];
    expect(libraryMissingFields(fields,{medidas:{width:"180",height:"35"},instalacao:"Não"})).toEqual([]);
    expect(libraryMissingFields(fields,{medidas:{width:"180",height:"35"},instalacao:"Sim"})).toEqual(["surface"]);
  });
  it("não considera zero como medida válida",()=>{
    expect(libraryMissingFields([required("medidas","dimensions")],{medidas:{width:"0",height:"35"}})).toEqual(["medidas"]);
  });
  it("detecta identificadores duplicados",()=>{
    const draft={...emptyLibraryDraft(),name:"Produto válido",description:"Descrição válida",fields:[required("x","text"),required("x","text")]};
    expect(validateLibraryDraft(draft)).toContain("Há identificadores de campos repetidos.");
  });
});
