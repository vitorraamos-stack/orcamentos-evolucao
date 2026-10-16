import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const migration=read("../../../supabase/migrations/20261016224000_library_products_foundation.sql");
const app=read("../../App.tsx");
const layout=read("../../components/Layout.tsx");
const adminUsers=read("../../../api/admin-users.ts");
const modules=read("../../../shared/app-modules.ts");

describe("Biblioteca: contratos de implantação fase 1",()=>{
  it("usa uma estrutura separada das tabelas de custos",()=>{
    expect(migration).toContain("create table public.library_products");
    expect(migration).toContain("create table public.library_publications");
    expect(migration).toContain("create table public.library_product_history");
    expect(migration).not.toMatch(/alter table public\.products/i);
  });
  it("mantém os rascunhos privados e a seleção comercial em tabela separada",()=>{
    expect(migration).toContain("library_products_manager_select");
    expect(migration).toContain("library_publications_commercial_select");
    expect(migration).toContain("revoke all on public.library_products,public.library_publications");
    expect(migration).toContain("where entry.value->>'visibility'='consultor'");
    expect(migration).toContain("where entry.value->>'visibility'='commercial'");
    expect(migration).toContain("'guidance',coalesce(v_product.draft->>'consultant_guidance','')");
    expect(migration).not.toContain("'internal_guidance',");
  });
  it("impede publicação concorrente e preserva histórico",()=>{
    expect(migration).toContain("v_product.revision<>p_expected_revision");
    expect(migration).toContain("insert into public.library_product_history");
    expect(migration).toContain("published_revision=v_product.revision");
    expect(migration).toContain("v_product.status='published' and v_product.revision=v_product.published_revision");
    expect(migration).toContain("delete from public.library_publications where product_id=p_product_id");
  });
  it("bloqueia campos sem controlador e exigências técnicas removidas pelo navegador",()=>{
    expect(migration).toContain("Existe campo condicional sem controlador comercial válido.");
    expect(migration).toContain("Instalação exige campo de superfície obrigatório.");
    expect(migration).toContain("Acabamento com pintura exige campo de cor obrigatório.");
    expect(migration).toContain("Há complementos inválidos ou com visibilidade incompatível.");
  });
  it("protege as rotas por módulo e papel",()=>{
    expect(app).toContain('path="/biblioteca/gestao"');
    expect(app).toContain('moduleKey="biblioteca_produtos"');
    expect(app).toContain("hubPermissions.isManager ? <LibraryV28Page management />");
    expect(app).toContain("hubPermissions.canCreateOs ? <LibraryV28Page />");
    expect(layout).toContain('hasModuleAccess("biblioteca_produtos") && hubPermissions.canCreateOs');
    expect(layout).toContain("const canManageLibrary = canViewLibrary && isAdmin");
    expect(adminUsers).toContain("'biblioteca_produtos'");
    expect(modules).toContain("key: 'biblioteca_produtos'");
  });
});
