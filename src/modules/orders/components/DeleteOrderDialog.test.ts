import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DeleteOrderDialog.tsx", import.meta.url), "utf8");

describe("DeleteOrderDialog recovery contract", () => {
  it("mantém o resultado do hard delete para recuperação de storage", () => {
    expect(source).toContain("deletedResult");
    expect(source).toContain("setDeletedResult(result)");
  });

  it("não oferece novo hard delete depois que a OS já foi removida do banco", () => {
    expect(source).toContain("if (deletedResult) return;");
    expect(source).toContain("A exclusão definitiva do banco já foi concluída");
  });

  it("oferece retry explícito de cleanup e saída segura para a Central", () => {
    expect(source).toContain("Tentar limpar arquivos novamente");
    expect(source).toContain("Ir para Central");
    expect(source).toContain("attemptCleanup(deletedResult)");
  });

  it("impede fechamento acidental do modal após o hard delete", () => {
    expect(source).toContain("if (deletedResult && !next) return;");
  });
});
