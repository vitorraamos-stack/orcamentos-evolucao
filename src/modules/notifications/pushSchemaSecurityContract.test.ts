import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261111105940_pwa_v4_push_schema_foundation.sql",
  "utf8"
);
const pgTap = readFileSync("supabase/tests/pwa_v4_push_schema_security.sql", "utf8");
const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  git: { deploymentEnabled: Record<string, boolean> };
};

describe("PWA V4 — proposta de schema e isolamento", () => {
  it("define quatro tabelas com RLS na mesma migration", () => {
    expect(migration).toMatch(/create table private\.notification_source_outbox\s*\(/i);
    expect(migration).toMatch(/create table public\.user_notifications\s*\(/i);
    expect(migration).toMatch(/create table private\.push_subscriptions\s*\(/i);
    expect(migration).toMatch(/create table private\.push_delivery_jobs\s*\(/i);
    for (const table of [
      "private.notification_source_outbox",
      "public.user_notifications",
      "private.push_subscriptions",
      "private.push_delivery_jobs",
    ]) {
      expect(migration).toContain("alter table " + table + " enable row level security;");
      expect(migration).toContain("revoke all on table " + table);
    }
  });

  it("bloqueia o esquema privado e não dá acesso ao browser a endpoints/segredos", () => {
    expect(migration).toContain("revoke all on schema private from public, anon, authenticated;");
    expect(migration).toContain("grant usage on schema private to service_role;");
    expect(migration).toContain("from public, anon, authenticated, service_role;");
    expect(migration).not.toMatch(/grant\s+(?:all|select|insert|update|delete)\s+on\s+private\.[^\n]+\s+to\s+(?:anon|authenticated)/i);
    expect(migration).toContain("endpoint_hash text not null unique");
    expect(migration).toContain("grant select, insert, update, delete on private.push_subscriptions");
  });

  it("expõe apenas leitura e marcação da coluna read_at", () => {
    expect(migration).toContain("grant select on public.user_notifications to authenticated;");
    expect(migration).toContain("grant update (read_at) on public.user_notifications to authenticated;");
    expect(migration).not.toMatch(/grant\s+(?:all|insert|delete)\s+on\s+public\.user_notifications\s+to\s+authenticated/i);
    expect(migration).toContain('policy "user_notifications_select_own_authorized"');
    expect(migration).toContain('policy "user_notifications_update_read_at_own_authorized"');
    expect((migration.match(/recipient_id = \(select auth\.uid\(\)\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((migration.match(/public\.has_module_access\(\(select auth\.uid\(\)\), required_module\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("with check (");
    expect(migration).toContain("o.archived, false");
  });

  it("garante deduplicação e não dispara eventos nesta fase", () => {
    expect(migration).toContain("source_key text not null unique");
    expect(migration).toContain("unique (source_event_id, recipient_id)");
    expect(migration).toContain("endpoint_hash text not null unique");
    expect(migration).toContain("unique (notification_id, subscription_id)");
    expect(migration.toLowerCase()).not.toMatch(/\bcreate\s+trigger\b/);
    expect(migration.toLowerCase()).not.toMatch(/\bcron\.schedule\b/);
    expect(migration.toLowerCase()).not.toMatch(/\bnet\.http_post\b/);
    expect(migration.toLowerCase()).not.toMatch(/\bhttp_post\b/);
  });

  it("inclui 43 testes pgTAP para grants, isolamento e ausência de triggers", () => {
    expect(pgTap).toContain("select plan(43);");
    expect((pgTap.match(/^select (?:has_schema|has_table|ok\(|is\()/gm) ?? []).length).toBe(43);
    expect(pgTap).toContain("has_schema_privilege('authenticated','private','USAGE')");
    expect(pgTap).toContain("has_column_privilege('authenticated','public.user_notifications','recipient_id','UPDATE')");
    expect(pgTap).toContain("pg_policies");
    expect(pgTap.trim().endsWith("rollback;")).toBe(true);
  });

  it("desabilita preview da branch e não configura envio nem dependências", () => {
    expect(vercel.git.deploymentEnabled["feat/pwa-v4-push-schema-security-20261111"]).toBe(false);
    expect(migration).not.toMatch(/VAPID_PRIVATE_KEY\s*=/i);
    expect(migration).not.toMatch(/CRON_SECRET\s*=/i);
    expect(migration).not.toContain("create extension");
    expect(migration).not.toMatch(/\bcreate\s+(?:or\s+replace\s+)?function\b/i);
  });
});
