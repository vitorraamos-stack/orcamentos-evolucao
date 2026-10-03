import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  shouldOpenArtworkQuickView,
  shouldOpenBoardQuickView,
} from "./BoardCard";

describe("BoardCard variants", () => {
  const source = readFileSync("src/shared/kanban/BoardCard.tsx", "utf8");
  it("mantém controles exclusivos de Produção protegidos", () => {
    expect(source).toContain('board === "production" && onTag');
    expect(source).toContain('board === "production" && isManager');
  });
  describe("abertura do Quick View da Arte", () => {
    const root = {} as EventTarget;

    it("abre ao clicar normalmente no corpo do card", () => {
      expect(
        shouldOpenArtworkQuickView({
          board: "art",
          isDragging: false,
          interactiveTarget: null,
          currentTarget: root,
        })
      ).toBe(true);
    });

    it('abre quando o role="button" do DnD faz closest retornar o próprio card', () => {
      expect(
        shouldOpenArtworkQuickView({
          board: "art",
          isDragging: false,
          interactiveTarget: root,
          currentTarget: root,
        })
      ).toBe(true);
    });

    it("não abre ao clicar em um controle interativo descendente", () => {
      expect(
        shouldOpenArtworkQuickView({
          board: "art",
          isDragging: false,
          interactiveTarget: {} as EventTarget,
          currentTarget: root,
        })
      ).toBe(false);
    });

    it("não abre durante o drag", () => {
      expect(
        shouldOpenArtworkQuickView({
          board: "art",
          isDragging: true,
          interactiveTarget: root,
          currentTarget: root,
        })
      ).toBe(false);
    });

    it("não abre no quadro de Produção", () => {
      expect(
        shouldOpenArtworkQuickView({
          board: "production",
          isDragging: false,
          interactiveTarget: null,
          currentTarget: root,
        })
      ).toBe(false);
    });
  });
  describe("abertura do Quick View da Produção", () => {
    const root = {} as EventTarget;
    it("abre no corpo e no próprio root", () => {
      expect(
        shouldOpenBoardQuickView({
          isDragging: false,
          interactiveTarget: null,
          currentTarget: root,
        })
      ).toBe(true);
      expect(
        shouldOpenBoardQuickView({
          isDragging: false,
          interactiveTarget: root,
          currentTarget: root,
        })
      ).toBe(true);
    });
    it("não abre em links, botões descendentes ou drag", () => {
      expect(
        shouldOpenBoardQuickView({
          isDragging: false,
          interactiveTarget: {} as EventTarget,
          currentTarget: root,
        })
      ).toBe(false);
      expect(
        shouldOpenBoardQuickView({
          isDragging: true,
          interactiveTarget: root,
          currentTarget: root,
        })
      ).toBe(false);
    });
  });
});
