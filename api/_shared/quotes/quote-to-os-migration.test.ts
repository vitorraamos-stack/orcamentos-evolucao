import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n");

describe("18E Quote → OS migration contract", () => {
  const foundation = read(
    "supabase/migrations/20261007195300_quote_to_os_handoff_18e.sql"
  );
  const hardening = read(
    "supabase/migrations/20261007201901_quote_to_os_handoff_18e_hardening.sql"
  );
  const privacy = read(
    "supabase/migrations/20261007202332_quote_to_os_handoff_18e_sensitive_data_hardening.sql"
  );

  it("persists a one-to-one Quote/Snapshot link on active OS orders", () => {
    expect(foundation).toMatch(/add column(?: if not exists)? quote_id uuid/i);
    expect(foundation).toContain("os_orders_quote_id_unique");
    expect(foundation).toContain(
      "foreign key (quote_snapshot_id, quote_id)"
    );
  });

  it("keeps the conversion authenticated and module-scoped", () => {
    expect(hardening).toContain(
      "public.has_module_access(v_uid,'calculadora')"
    );
    expect(privacy).toMatch(
      /revoke execute[\s\S]*from public, anon, authenticated/i
    );
    expect(privacy).toMatch(
      /grant execute[\s\S]*to authenticated/i
    );
  });

  it("rebuilds commercial fields and the OS item from the persisted snapshot", () => {
    expect(hardening).toContain("v_snapshot.commercial_snapshot");
    expect(hardening).toContain("'quantity',v_snapshot.commercial_quantity");
    expect(hardening).toContain("'items',jsonb_build_array(");
    expect(hardening).toContain("'reproducao',false");
    expect(hardening).toContain("'letra_caixa',false");
    expect(hardening).not.toContain("v_clean := p_payload");
  });

  it("is idempotent by Quote and only accepts ACCEPTED quotes", () => {
    expect(privacy).toContain("v_quote.status <> 'ACCEPTED'");
    expect(privacy).toContain("where quote_id=p_quote_id");
    expect(privacy).toContain("return v_existing");
  });

  it("does not expose the Quote total through operational OS data", () => {
    expect(privacy).toContain("set quote_total=null");
    expect(privacy).toContain("quote_total=null");
    expect(privacy).not.toContain("'quote_total',v_snapshot.total_selling_price");
    expect(privacy).toContain(
      "(quote_id is not null and quote_snapshot_id is not null)"
    );
  });
});
