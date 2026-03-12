import { beforeEach, describe, expect, it, vi } from "vitest";
import { KIOSK_TERMINAL_ID_KEY } from "./constants";
import { getOrCreateTerminalId, parseKioskError, resolveMoveAction } from "./utils";

const createStorage = () => {
  const memory = new Map<string, string>();
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => {
      memory.clear();
    },
  };
};

describe("kiosk helpers", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: createStorage(),
      configurable: true,
    });
  });

  it("resolve ação inicial corretamente por estágio e modo", () => {
    expect(resolveMoveAction({ stage: "acabamento_entrega_retirada", deliveryMode: "RETIRADA" })).toBe("to_packaging");
    expect(resolveMoveAction({ stage: "acabamento_instalacao", deliveryMode: "instalacao" })).toBe("to_installations");
    expect(resolveMoveAction({ stage: "embalagem", deliveryMode: "RETIRADA" })).toBe("to_ready_notify");
    expect(resolveMoveAction({ stage: "embalagem", deliveryMode: "ENTREGA" })).toBe("to_logistics");
  });

  it("mapeia erros técnicos para mensagens amigáveis", () => {
    expect(parseKioskError({ code: "23505" })).toContain("já está no quiosque");
    expect(parseKioskError({ details: "KIOSK_UPSTREAM_NOT_FOUND" })).toContain("não encontrada");
    expect(parseKioskError(new TypeError("Failed to fetch"))).toContain("Falha de rede");
  });

  it("gera e persiste terminal_id", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("abc-123");

    const first = getOrCreateTerminalId();
    const second = getOrCreateTerminalId();

    expect(first).toBe("abc-123");
    expect(second).toBe("abc-123");
    expect(localStorage.getItem(KIOSK_TERMINAL_ID_KEY)).toBe("abc-123");
  });
});
