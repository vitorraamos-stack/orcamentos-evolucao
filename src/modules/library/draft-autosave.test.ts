import { describe, expect, it, vi } from "vitest";
import { LibraryDraftSaveCoordinator } from "./draft-autosave";
import { emptyLibraryDraft, type LibraryProductRecord } from "./model";

const ID = "11111111-1111-4111-8111-111111111111";
const record = (name = "Letreiro", revision = 3): LibraryProductRecord => ({
  id: ID,
  draft: { ...emptyLibraryDraft(), name },
  revision,
  status: "draft",
  published_version: 0,
  published_revision: 0,
  updated_at: "2026-10-20T00:00:00Z",
});
const modify = (base: LibraryProductRecord, name: string) =>
  ({ ...base.draft, name });
const saved = (old: LibraryProductRecord, draft: LibraryProductRecord["draft"]) =>
  ({ ...old, draft, revision: old.revision + 1 });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(save: (base: LibraryProductRecord, draft: LibraryProductRecord["draft"]) =>
  Promise<LibraryProductRecord>) {
  const notify = vi.fn();
  const committed = vi.fn();
  const subject = new LibraryDraftSaveCoordinator(save, notify, committed);
  subject.select(record());
  return { subject, notify, committed };
}
describe("PR 31E — coordinator de autosave com revisão otimista", () => {
  it("grava somente alterações, atualiza a revisão pelo retorno atômico e não repete salvamentos", async () => {
    const save = vi.fn(async (base, draft) => saved(base, draft));
    const { subject, committed } = setup(save);
    expect(await subject.flush()).toBe(true);
    expect(save).not.toHaveBeenCalled();
    subject.edit(modify(record(), "PVC Expandido"));
    expect(subject.getSnapshot()).toMatchObject({status:"pending",dirty:true,revision:3});
    expect(await subject.flush()).toBe(true);
    expect(subject.getSnapshot()).toMatchObject({status:"saved",dirty:false,revision:4});
    expect(committed).toHaveBeenCalledOnce();
    expect(await subject.flush()).toBe(true);
    expect(save).toHaveBeenCalledOnce();
  });

  it("não perde letras digitadas enquanto um salvamento anterior está em voo", async () => {
    const first = deferred<LibraryProductRecord>();
    const save = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(async (base, draft) => saved(base, draft));
    const { subject, committed } = setup(save);
    subject.edit(modify(record(), "PVC 1"));
    const pending = subject.flush();
    expect(subject.getSnapshot().status).toBe("saving");
    subject.edit(modify(record(), "PVC 12"));
    expect(await subject.flush()).toBe(false);
    first.resolve(saved(record(), modify(record(), "PVC 1")));
    expect(await pending).toBe(true);
    expect(subject.getSnapshot()).toMatchObject({status:"pending",dirty:true,revision:4});
    expect(await subject.flush()).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].revision).toBe(4);
    expect(save.mock.calls[1][1].name).toBe("PVC 12");
    expect(subject.getSnapshot()).toMatchObject({status:"saved",dirty:false,revision:5});
    expect(committed).toHaveBeenCalledTimes(2);
  });

  it("não sobrescreve o registro de outro administrador ao detectar revisão obsoleta", async () => {
    let database = record("Original", 3);
    const save = vi.fn(async (base, draft) => {
      if (base.revision !== database.revision) {
        const conflict = new Error("Outra pessoa alterou");
        conflict.name = "LibraryDraftConflictError";
        throw conflict;
      }
      database = saved(database, draft);
      return database;
    });
    const first = setup(save), second = setup(save);
    first.subject.edit(modify(record(), "Admin 1"));
    second.subject.edit(modify(record(), "Admin 2"));
    expect(await first.subject.flush()).toBe(true);
    expect(await second.subject.flush()).toBe(false);
    expect(second.subject.getSnapshot()).toMatchObject({status:"conflict",dirty:true,blocked:true});
    expect(await second.subject.flush(true)).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
    expect(database.draft.name).toBe("Admin 1");
    expect(second.subject.getBaseline()?.draft.name).toBe("Letreiro");
    second.subject.acceptServerRecord(database);
    expect(second.subject.getSnapshot()).toMatchObject({status:"saved",dirty:false,revision:4});
  });

  it("pausa autosave em falha de rede e só tenta novamente por comando explícito", async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error("Sem conexão"))
      .mockImplementationOnce(async (base, draft) => saved(base, draft));
    const { subject } = setup(save);
    subject.edit(modify(record(), "PVC offline"));
    expect(await subject.flush()).toBe(false);
    expect(subject.getSnapshot()).toMatchObject({status:"error",dirty:true,blocked:true});
    subject.edit(modify(record(), "PVC offline novamente"));
    expect(await subject.flush()).toBe(false);
    expect(save).toHaveBeenCalledOnce();
    expect(await subject.flush(true)).toBe(true);
    expect(save.mock.calls[1][1].name).toBe("PVC offline novamente");
  });

  it("aceita o JSONB com propriedades em outra ordem sem perder confirmação", async () => {
    const reordered = vi.fn(async (base: LibraryProductRecord, draft:LibraryProductRecord["draft"]) => ({
      ...base, revision: base.revision + 1,
      draft: Object.fromEntries(Object.entries(draft).reverse()) as LibraryProductRecord["draft"],
    }));
    const { subject } = setup(reordered);
    subject.edit(modify(record(), "PVC com chaves reordenadas"));
    expect(await subject.flush()).toBe(true);
    expect(subject.getSnapshot()).toMatchObject({ status: "saved", dirty: false, revision: 4 });
  });

  it("não aplica o retorno de uma requisição antiga após troca de ficha", async () => {
    const operation = deferred<LibraryProductRecord>();
    const save = vi.fn().mockImplementationOnce(()=>operation.promise);
    const {subject,committed}=setup(save);
    subject.edit(modify(record(), "Antigo"));
    const promise=subject.flush();
    const different={...record("Outro"),id:"22222222-2222-4222-8222-222222222222"};
    subject.select(different);
    operation.resolve(saved(record(), modify(record(), "Antigo")));
    expect(await promise).toBe(false);
    expect(subject.getSnapshot()).toMatchObject({productId:different.id,status:"saved",dirty:false});
    expect(committed).not.toHaveBeenCalled();
  });

  it("rejeita resposta de salvamento sem confirmação da revisão e do texto enviado", async () => {
    const bad = vi.fn(async (base:LibraryProductRecord)=>({...base,revision:3}));
    const {subject}=setup(bad);
    subject.edit(modify(record(),"Texto novo"));
    expect(await subject.flush()).toBe(false);
    expect(subject.getSnapshot()).toMatchObject({status:"error",dirty:true});
    expect(subject.getError()?.message).toMatch(/confirmação/);
  });
});
