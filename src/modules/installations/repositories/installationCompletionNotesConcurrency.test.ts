import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
import { saveCompletionNotes } from "./installationExecutionRepository";

const id = "11111111-1111-4111-8111-111111111111";
const revision = "2026-10-16T20:00:00.123456+00:00";
const rpcName = "hub_os_update_installation_completion_notes_if_current";
const sql = readFileSync(
  new URL("../../../../docs/tasks/os-installation-completion-notes-concurrency-proposed.sql", import.meta.url),
  "utf8"
);
const page = readFileSync(new URL("../pages/InstallationExecutionPage.tsx", import.meta.url), "utf8");

describe("contrato de observações finais protegidas", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("envia texto e revisão de origem ao RPC e devolve o registro atualizado", async () => {
    const updated = { id, updated_at: "2026-10-16T20:02:00Z", completion_notes: "Texto" };
    mocks.rpc.mockResolvedValueOnce({ data: updated, error: null });
    await expect(saveCompletionNotes(id, "Texto", revision)).resolves.toEqual(updated);
    expect(mocks.rpc).toHaveBeenCalledWith(rpcName, {
      p_installation_id: id,
      p_expected_updated_at: revision,
      p_notes: "Texto",
    });
  });

  it("falha sem fallback quando o banco acusa versão ultrapassada", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "As observacoes foram atualizadas por outro colaborador" },
    });
    await expect(saveCompletionNotes(id, "Meu texto", revision)).rejects.toThrow(/atualizadas/);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc.mock.calls[0][0]).toBe(rpcName);
  });

  it("rejeita revisão inválida antes de chamar o banco", async () => {
    await expect(saveCompletionNotes(id, "texto", "")).rejects.toThrow();
    await expect(saveCompletionNotes(id, "texto", "sem data")).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("mantém permissões do executor, bloqueio, validação e delegação", () => {
    for (const part of [
      "public.hub_os_assert_installation_executor(v_installation, false)",
      "for update;",
      "v_installation.updated_at is distinct from p_expected_updated_at",
      "public.hub_os_update_installation_completion_notes_secure(",
      "set search_path = ''",
      "from public, anon, authenticated;",
      "to authenticated;",
    ]) expect(sql).toContain(part);
    expect((sql.match(/create or replace function public\.hub_os_update_installation_completion_notes_if_current\(/g) ?? []).length).toBe(1);
    expect(sql).not.toMatch(/^\s*(?:drop|alter table|delete from|truncate)/im);
  });

  it("protege o texto contra atualizações por checklist e Realtime", () => {
    expect(page).toContain("receiveCompletionNotes(previous, data.installation)");
    expect(page).toContain("editCompletionNotesDraft(previous, e.target.value)");
    expect(page).toContain("notesDraft.expectedUpdatedAt");
    expect(page).toContain("notesDraft.changedRemotely");
    expect(page).toContain("freshCompletionNotesDraft(saved)");
    expect(page).toContain("resetCompletionNotesToLatest(previous)");
    expect(page).toContain("loadSequenceRef.current");
    expect(page).toContain("disabled={readonly || savingNotes || !notesActiveInstallation || !notesDirty || notesDraft.changedRemotely}");
  });
});
