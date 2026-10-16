import { describe, expect, it } from "vitest";
import {
  editCompletionNotesDraft,
  freshCompletionNotesDraft,
  receiveCompletionNotes,
  resetCompletionNotesToLatest,
} from "./completionNotesDraft";

const first = { id: "install-1", completion_notes: "Antes", updated_at: "2026-10-16T20:00:00.000Z" };
const second = { ...first, completion_notes: "Alterado por outro usuário", updated_at: "2026-10-16T20:04:00.000Z" };

describe("rascunho de observações da instalação", () => {
  it("mostra atualizações remotas enquanto ninguém está editando", () => {
    expect(receiveCompletionNotes(freshCompletionNotesDraft(first), second)).toEqual(freshCompletionNotesDraft(second));
  });

  it("preserva texto digitado e a revisão original se chegar um evento Realtime", () => {
    const draft = editCompletionNotesDraft(freshCompletionNotesDraft(first), "Meu texto ainda não salvo");
    const next = receiveCompletionNotes(draft, second);
    expect(next.text).toBe("Meu texto ainda não salvo");
    expect(next.baseText).toBe("Antes");
    expect(next.expectedUpdatedAt).toBe(first.updated_at);
    expect(next.latestUpdatedAt).toBe(second.updated_at);
    expect(next.changedRemotely).toBe(true);
  });

  it("não deixa uma atualização repetida apagar o aviso de conflito", () => {
    const original = editCompletionNotesDraft(freshCompletionNotesDraft(first), "Minhas alterações");
    const collided = receiveCompletionNotes(original, second);
    expect(receiveCompletionNotes(collided, second)).toEqual(collided);
  });

  it("somente descarta o rascunho quando o operador escolhe a versão atual", () => {
    const collided = receiveCompletionNotes(
      editCompletionNotesDraft(freshCompletionNotesDraft(first), "Não salvar ainda"), second
    );
    expect(resetCompletionNotesToLatest(collided)).toEqual(freshCompletionNotesDraft(second));
  });

  it("não reaproveita rascunhos de uma instalação diferente", () => {
    const draft = editCompletionNotesDraft(freshCompletionNotesDraft(first), "Da instalação 1");
    expect(receiveCompletionNotes(draft, { ...second, id: "install-2" })).toEqual(
      freshCompletionNotesDraft({ ...second, id: "install-2" })
    );
  });

  it("detecta alterações no carimbo de versão mesmo que o texto seja igual", () => {
    const draft = editCompletionNotesDraft(freshCompletionNotesDraft(first), "Texto novo");
    const refreshed = receiveCompletionNotes(draft, { ...first, updated_at: second.updated_at });
    expect(refreshed.changedRemotely).toBe(true);
  });
});
