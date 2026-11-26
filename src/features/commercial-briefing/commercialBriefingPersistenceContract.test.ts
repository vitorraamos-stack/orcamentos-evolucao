import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DELIVERY_DEADLINE_PRESETS } from "@/features/hubos/deliveryDeadlineConfig";
import { ART_DIRECTION_CHOICES } from "@/features/hubos/orderUrgency";
import { COMMERCIAL_BRIEFING_LOGISTICS } from "./commercialBriefingDomain";

const sql = readFileSync("docs/tasks/briefing-comercial/02-persistence-candidate.sql", "utf8");
const behavior = readFileSync("docs/tasks/briefing-comercial/02-persistence-behavior-candidate.sql", "utf8");
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));

describe("commercial briefing SQL candidate (static, not a DB test)", () => {
  it("defines RLS and denies direct writes to both tables", () => {
    for (const name of ["commercial_briefings", "commercial_briefing_revisions"]) {
      expect(sql).toContain("alter table public." + name + " enable row level security;");
    }
    expect(sql).toMatch(/revoke all on public\.commercial_briefings, public\.commercial_briefing_revisions\s+from public, anon, authenticated;/);
    expect(sql).toContain("grant select on public.commercial_briefings, public.commercial_briefing_revisions to authenticated;");
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.commercial_briefing/i);
  });
  it("restricts authorization to current actor and official module and roles", () => {
    expect(sql).toContain("p.id = (select auth.uid())");
    expect(sql).toContain("public.has_module_access(p.id, 'hub_os')");
    expect(sql).toContain("consultant_id = (select auth.uid())");
    expect(sql).toContain("b.consultant_id = u for update");
    expect(sql).toContain("is_anonymous");
    expect(sql).not.toContain("user_metadata");
  });
  it("keeps privileged writers in a separate schema, public wrappers invoker", () => {
    expect(sql).toContain("create schema commercial_briefing_private;");
    const exposed = sql.split("-- Exposed wrappers")[1];
    expect(exposed).toBeDefined();
    expect(exposed.match(/security invoker set search_path = ''/g)).toHaveLength(3);
    expect(exposed).not.toMatch(/security definer/i);
    expect(exposed).toMatch(/from public, anon, authenticated;/);
  });
  it("requires expected revisions, atomic history and prevents duplicate create retries", () => {
    expect(sql.match(/p_expected_revision is distinct from r.revision/g)).toHaveLength(2);
    expect(sql.match(/for update;/g)).toHaveLength(2);
    expect(sql).toContain("on conflict (id) do nothing");
    expect(sql).toContain("primary key (briefing_id, revision)");
    expect(sql).toContain("if r.draft = p_draft then return r; end if;");
    expect(sql).toContain("confirmation = case when changed then null else r.confirmation end");
    expect(sql).not.toMatch(/unique\s*\(digisac_contact_id/i);
  });
  it("does not create OS, change existing tables, or publish any route", () => {
    expect(sql).not.toMatch(/(?:alter table|insert into|update|delete from) public\.os_orders\b/i);
    expect(sql).not.toMatch(/create\s+trigger|cron\.schedule/i);
    expect(sql).not.toContain("hub_os_create_order_secure");
    expect(vercel.git.deploymentEnabled["feat/briefing-comercial"]).toBe(false);
  });
  it("keeps server allowlists aligned with the official OS configuration", () => {
    for (const [field, choices] of [
      ["deadlinePreset", DELIVERY_DEADLINE_PRESETS],
      ["artDirectionTag", ART_DIRECTION_CHOICES],
      ["logisticType", COMMERCIAL_BRIEFING_LOGISTICS],
    ] as const) {
      const line = sql.split("\n").find(value => value.includes("d->>'" + field + "' not in"));
      expect(line).toBeDefined();
      const actual = Array.from(line!.matchAll(/'([^']+)'/g), match => match[1]).slice(1);
      expect(actual.slice().sort()).toEqual([...choices].sort());
    }
  });
  it("keeps transactional pgTAP tests separate until homologation", () => {
    expect(behavior).toContain("select plan(42);");
    expect(behavior.match(/^select (?:ok|is|lives_ok|throws_ok)\(/gm)).toHaveLength(42);
    expect(behavior).toContain("set local role authenticated;");
    expect(behavior.trim().endsWith("rollback;")).toBe(true);
  });
});
