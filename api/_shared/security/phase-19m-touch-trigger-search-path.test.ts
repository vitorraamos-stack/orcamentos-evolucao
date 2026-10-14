import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261014094500_phase_19m_touch_trigger_search_path_hardening.sql", "utf8").replaceAll("\r\n", "\n");
const functions = [
  {
    "n": "hub_os_order_flow_state_touch_updated_at",
    "hash": "608ef48381668ad5cc300914a52c93f5",
    "tr": "hub_os_order_flow_state_touch_updated_at_trg",
    "table": "public.hub_os_order_flow_state"
  },
  {
    "n": "os_kiosk_board_touch_updated_at",
    "hash": "608ef48381668ad5cc300914a52c93f5",
    "tr": "os_kiosk_board_touch_updated_at_trg",
    "table": "public.os_kiosk_board"
  },
  {
    "n": "set_os_orders_updated_at",
    "hash": "0c35a013f9fab2ad61698db68776b8eb",
    "tr": "os_orders_set_updated_at",
    "table": "public.os_orders"
  },
  {
    "n": "set_portfolio_photos_updated_at",
    "hash": "204b9b9355e61b7541bc0633bbc9294c",
    "tr": "portfolio_photos_set_updated_at",
    "table": "public.portfolio_photos"
  },
  {
    "n": "set_updated_at_timestamp",
    "hash": "204b9b9355e61b7541bc0633bbc9294c",
    "tr": "os_order_asset_jobs_set_updated_at",
    "table": "public.os_order_asset_jobs"
  }
];

describe("19M search_path for timestamp trigger functions", () => {
  it("requires existing function bodies, immutable signatures and enabled triggers", () => {
    expect(sql).toContain("DO $preflight$");
    expect(sql).toContain("DO $postcheck$");
    for (const f of functions) {
      expect(sql).toContain(`to_regprocedure('public.${f.n}()')`);
      expect(sql).toContain(`md5(p.prosrc)='${f.hash}'`);
      expect(sql).toContain(`t.tgname='${f.tr}'`);
      expect(sql).toContain(`t.tgrelid='${f.table}'::regclass`);
      expect(sql).toContain(`19M_ABORTED_PRECONDITION_${f.n.toUpperCase()}`);
      expect(sql).toContain(`19M_ABORTED_POSTCONDITION_${f.n.toUpperCase()}`);
    }
  });

  it("sets only the five approved search paths without changing implementation", () => {
    const alterations = sql.match(/^ALTER FUNCTION .+$/gm) ?? [];
    expect(alterations).toHaveLength(functions.length);
    for (const f of functions) {
      expect(alterations).toContain(`ALTER FUNCTION public.${f.n}() SET search_path TO '';`);
      expect(sql).toContain("p.proconfig @> ARRAY['search_path=']::text[]");
    }
  });

  it("never changes data, policies, permissions, or trigger definitions", () => {
    expect(sql).not.toMatch(/^\s*(?:CREATE|DROP|ALTER)\s+TRIGGER\b/im);
    expect(sql).not.toMatch(/^\s*(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+(?:public\.|auth\.)/im);
    expect(sql).not.toMatch(/^\s*(?:REVOKE|GRANT)\s+/im);
    expect(sql).not.toMatch(/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/im);
    expect(sql).not.toMatch(/^\s*(?:CREATE|DROP|ALTER)\s+POLICY\b/im);
  });
});
