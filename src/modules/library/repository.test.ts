import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyLibraryDraft, type LibraryProductRecord } from "./model";

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: supabaseMock }));

import {
  archiveLibraryProduct,
  createLibraryDraft,
  listLibraryDrafts,
  listLibraryPublications,
  publishLibraryDraft,
  restoreLibraryProduct,
  saveLibraryDraft,
} from "./repository";

const draft = {
  ...emptyLibraryDraft(),
  name: "Letreiro em PVC Expandido",
  description: "Produção de letreiro sob medida",
};

const product: LibraryProductRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  draft,
  revision: 3,
  status: "published",
  published_version: 1,
  published_revision: 2,
  updated_at: "2026-10-19T12:00:00Z",
};

beforeEach(() => {
  supabaseMock.from.mockReset();
  supabaseMock.rpc.mockReset();
});

describe("Biblioteca V28 — ciclo de vida com Supabase simulado (sem escritas reais)", () => {
  it("lista fichas privadas somente pela tabela administrativa", async () => {
    const order = vi.fn().mockResolvedValue({ data: [product], error: null });
    const select = vi.fn().mockReturnValue({ order });
    supabaseMock.from.mockReturnValue({ select });

    expect(await listLibraryDrafts()).toEqual([product]);
    expect(supabaseMock.from).toHaveBeenCalledExactlyOnceWith("library_products");
    expect(select).toHaveBeenCalledWith(
      "id,draft,revision,status,published_version,published_revision,updated_at"
    );
    expect(order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  it("consulta o catálogo comercial somente através de snapshots publicados", async () => {
    const publication = {
      product_id: product.id,
      version: 1,
      published_at: product.updated_at,
      content: { name: draft.name, category: draft.category },
    };
    const order = vi.fn().mockResolvedValue({ data: [publication], error: null });
    const select = vi.fn().mockReturnValue({ order });
    supabaseMock.from.mockReturnValue({ select });

    expect(await listLibraryPublications()).toEqual([publication]);
    expect(supabaseMock.from).toHaveBeenCalledExactlyOnceWith("library_publications");
    expect(select).toHaveBeenCalledWith("product_id,version,content,published_at");
  });

  it("cria um rascunho em nome do usuário autenticado, sem publicar", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: product.id }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    supabaseMock.from.mockReturnValue({ insert });

    expect(await createLibraryDraft("authenticated-manager", draft)).toBe(product.id);
    expect(supabaseMock.from).toHaveBeenCalledWith("library_products");
    expect(insert).toHaveBeenCalledWith({
      created_by: "authenticated-manager",
      draft,
    });
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it("não confirma cadastro quando o Supabase não retorna um identificador", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: null });
    supabaseMock.from.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single }),
      }),
    });

    await expect(createLibraryDraft("manager", draft)).rejects.toThrow(
      "Não foi possível identificar o novo produto."
    );
  });

  it("salva uma edição apenas com revisão correspondente (lock otimista)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: product.id }, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const revisionEq = vi.fn().mockReturnValue({ select });
    const idEq = vi.fn().mockReturnValue({ eq: revisionEq });
    const update = vi.fn().mockReturnValue({ eq: idEq });
    supabaseMock.from.mockReturnValue({ update });

    await expect(saveLibraryDraft(product, { ...draft, description: "Nova descrição" }))
      .resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith({
      draft: { ...draft, description: "Nova descrição" },
    });
    expect(idEq).toHaveBeenCalledWith("id", product.id);
    expect(revisionEq).toHaveBeenCalledWith("revision", 3);
    expect(select).toHaveBeenCalledWith("id");
  });

  it("bloqueia conflito entre dois gestores sem sobrescrever o outro rascunho", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const revisionEq = vi.fn().mockReturnValue({ select });
    const idEq = vi.fn().mockReturnValue({ eq: revisionEq });
    supabaseMock.from.mockReturnValue({
      update: vi.fn().mockReturnValue({ eq: idEq }),
    });

    await expect(saveLibraryDraft(product, draft)).rejects.toThrow(
      "Esta ficha foi atualizada por outra pessoa. Recarregue antes de salvar."
    );
    expect(revisionEq).toHaveBeenCalledWith("revision", product.revision);
  });

  it("publica pela RPC usando ID do produto e revisão esperada", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 2, error: null });
    expect(await publishLibraryDraft(product)).toBe(2);
    expect(supabaseMock.rpc).toHaveBeenCalledExactlyOnceWith(
      "library_publish_product",
      { p_product_id: product.id, p_expected_revision: 3 }
    );
  });

  it.each([null, 0, -1, "invalid", 1.5])(
    "não confirma publicação quando a RPC retorna versão inválida (%s)",
    async (version) => {
      supabaseMock.rpc.mockResolvedValue({ data: version, error: null });
      await expect(publishLibraryDraft(product)).rejects.toThrow(
        "Não foi possível confirmar a versão publicada."
      );
    }
  );

  it("propaga a recusa da RPC sem informar sucesso de publicação", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { message: "Sem permissão para publicar produtos." },
    });
    await expect(publishLibraryDraft(product)).rejects.toThrow(
      "Sem permissão para publicar produtos."
    );
  });

  it("arquiva e restaura exclusivamente pelas RPCs, sem UPDATE direto no cliente", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });

    await archiveLibraryProduct(product.id);
    await restoreLibraryProduct(product.id);
    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(
      1, "library_archive_product", { p_product_id: product.id }
    );
    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(
      2, "library_restore_product", { p_product_id: product.id }
    );
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("não silencia erros de permissão ao arquivar ou restaurar", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { message: "Sem permissão para alterar produtos." },
    });

    await expect(archiveLibraryProduct(product.id)).rejects.toThrow("Sem permissão");
    await expect(restoreLibraryProduct(product.id)).rejects.toThrow("Sem permissão");
  });
});
