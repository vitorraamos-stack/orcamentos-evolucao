import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const path = new URL("../../../supabase/migrations/20261016205015_library_trigger_execute_hardening.sql", import.meta.url);
const sql=readFileSync(path,"utf8");
describe("Biblioteca: privilégios de trigger",()=>{
 it("não permite executar o trigger diretamente pelas funções de API",()=>{
   expect(sql).toContain("revoke all on function public.library_products_touch_revision()");
   expect(sql).toContain("from public, anon, authenticated");
 });
});