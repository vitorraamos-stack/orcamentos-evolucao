import { beforeEach, describe, expect, it, vi } from "vitest";
import { KIOSK_ALLOWED_MOVE_ACTIONS, KIOSK_MOVE_CTA_LABELS, KIOSK_TERMINAL_ID_KEY } from "./constants";
import {
  getOrCreateTerminalId,
  isUpstreamFinalized,
  parseKioskError,
  resolveKioskHealthState,
  resolveMoveAction,
  shouldApplySyncResponse,
  shouldBlockKioskMutations,
} from "./utils";

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
    expect(resolveMoveAction({ stage: "pronto_avisar", deliveryMode: "RETIRADA" })).toBeNull();
    expect(resolveMoveAction({ stage: "logistica", deliveryMode: "ENTREGA" })).toBeNull();
    expect(resolveMoveAction({ stage: "instalacoes", deliveryMode: "instalacao" })).toBeNull();
  });


  it("mantém contrato de ação do quiosque sem retirada/finalização manual", () => {
    expect(KIOSK_ALLOWED_MOVE_ACTIONS).toEqual([
      "to_packaging",
      "to_installations",
      "to_ready_notify",
      "to_logistics",
    ]);

    expect(Object.values(KIOSK_MOVE_CTA_LABELS).join(" ").toLowerCase()).not.toContain("avisado");
    expect(Object.values(KIOSK_MOVE_CTA_LABELS).join(" ").toLowerCase()).not.toContain("retirado");
    expect(KIOSK_MOVE_CTA_LABELS.to_ready_notify).toContain("Hub OS");
  });

  it("mapeia erros técnicos para mensagens amigáveis", () => {
    expect(parseKioskError({ code: "23505" })).toContain("já está no quiosque");
    expect(parseKioskError({ details: "KIOSK_UPSTREAM_NOT_FOUND" })).toContain("não encontrada");
    expect(parseKioskError(new TypeError("Failed to fetch"))).toContain("Falha de rede");
    expect(parseKioskError({ details: "KIOSK_AUTH_REQUIRED" })).toContain("Sessão expirada");
    expect(parseKioskError({ details: "KIOSK_INVALID_STAGE" })).toContain("Instalações");
    expect(parseKioskError({ details: "KIOSK_FEEDBACK_REQUIRED" })).toContain("feedback");
    expect(parseKioskError({ message: `column reference "id" is ambiguous` })).toContain("desatualizada");
    expect(
      parseKioskError({
        message: "Falha",
        cause: { details: "KIOSK_DUPLICATE", code: "P0001" },
      })
    ).toContain("já está no quiosque");
  });

  it("gera e persiste terminal_id", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("abc-123");

    const first = getOrCreateTerminalId();
    const second = getOrCreateTerminalId();

    expect(first).toBe("abc-123");
    expect(second).toBe("abc-123");
    expect(localStorage.getItem(KIOSK_TERMINAL_ID_KEY)).toBe("abc-123");
  });

  it("calcula estado degradado e bloqueio de mutações", () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    const staleSync = new Date(now - 200_000).toISOString();

    expect(
      resolveKioskHealthState({
        isOnline: true,
        isSyncing: false,
        lastSyncAt: staleSync,
        lastErrorKind: "network",
        staleAfterMs: 45_000,
        now,
      })
    ).toBe("degraded");

    expect(
      shouldBlockKioskMutations({
        healthState: "degraded",
        lastSyncAt: staleSync,
        criticalStaleAfterMs: 120_000,
        now,
      })
    ).toBe(true);
  });

  it("detecta finalização upstream e protege contra resposta fora de ordem", () => {
    expect(isUpstreamFinalized("Pedido finalizado")).toBe(true);
    expect(isUpstreamFinalized("Em produção")).toBe(false);
    expect(shouldApplySyncResponse({ requestSeq: 2, appliedSeq: 3 })).toBe(false);
    expect(shouldApplySyncResponse({ requestSeq: 4, appliedSeq: 3 })).toBe(true);
  });
});
