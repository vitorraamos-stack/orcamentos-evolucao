import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261013171442_quote_management_cleanup_19d.sql",
  "utf8"
).replaceAll("\r\n", "\n");

describe("19D Quote management cleanup migration", () => {
  it("fails closed if Quote or Quote→OS data appears before cleanup", () => {
    expect(sql).toContain("QUOTE_CLEANUP_ABORTED_QUOTES_NOT_EMPTY");
    expect(sql).toContain("QUOTE_CLEANUP_ABORTED_SNAPSHOTS_NOT_EMPTY");
    expect(sql).toContain("QUOTE_CLEANUP_ABORTED_EVENTS_NOT_EMPTY");
    expect(sql).toContain("QUOTE_CLEANUP_ABORTED_OS_LINKS_PRESENT");
  });

  it("removes only the retired Quote persistence and modern Quote→OS bridge", () => {
    expect(sql).toContain("drop table if exists public.quote_events");
    expect(sql).toContain("drop table if exists public.quote_snapshots");
    expect(sql).toContain("drop table if exists public.quotes");
    expect(sql).toContain("drop sequence if exists public.quote_number_seq");
    expect(sql).toContain("hub_os_create_from_quote_secure");
    expect(sql).toContain("drop column if exists quote_snapshot_id");
    expect(sql).toContain("drop column if exists quote_id");
    expect(sql).toContain("drop column if exists quote_total");
  });

  it("preserves the legacy public.os payment fields", () => {
    expect(sql).not.toMatch(/alter table public\.os\s/i);
    expect(sql).not.toMatch(/drop table if exists public\.os\b/i);
  });
});
