import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read=(filename:string)=>readFileSync(new URL(filename,import.meta.url),"utf8");
const catalog=read("./LibraryCommercialPage.tsx");
const product=read("./CommercialProductInfo.tsx");
const configurator=read("./CommercialConfigurator.tsx");

describe("Biblioteca Comercial — legibilidade da tipografia",()=>{
  it("usa fontes maiores no catálogo e mantém a descrição em duas linhas",()=>{
    expect(catalog).toContain('text-[15px] leading-6');
    expect(catalog).toContain('text-lg font-semibold');
    expect(catalog).toContain('line-clamp-2');
  });
  it("amplia textos descritivos e orientações sem perder hierarquia",()=>{
    expect(product).toContain('text-[15px] leading-[1.65]');
    expect(product).toContain('text-lg font-semibold');
    expect(product).toContain('text-[13px] text-muted-foreground');
  });
  it("mantém formulários e resumo comercial legíveis",()=>{
    expect(configurator).toContain('h-11 w-full min-w-0');
    expect(configurator).toContain('text-sm font-medium');
    expect(configurator).toContain('bg-muted/45 p-3 text-[15px] leading-6');
    expect(configurator).toContain('min-h-11 text-[15px]');
  });
  it("evita microfontes e mantém ações e complementos responsivos",()=>{
    const all=catalog+"\n"+product+"\n"+configurator;
    expect(all).not.toMatch(/text-\[(?:10|11)px\]/);
    expect(configurator.match(/grid gap-2 2xl:grid-cols-2/g)).toHaveLength(2);
  });
});
