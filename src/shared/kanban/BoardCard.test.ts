import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("BoardCard variants", () => {
  const source = readFileSync("src/shared/kanban/BoardCard.tsx", "utf8");
  it("mantém controles exclusivos de Produção protegidos", () => {
    expect(source).toContain('board === "production" && onTag');
    expect(source).toContain('board === "production" && isManager');
  });
  it("abre detalhe somente na Arte sem aninhar botão", () => {
    expect(source).toContain('board === "art" && !drag.isDragging');
    expect(source).toContain('closest("a,button,[role=button],[role=menuitem]")');
  });
});
