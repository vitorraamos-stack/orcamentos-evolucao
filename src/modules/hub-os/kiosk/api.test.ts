import { describe, expect, it } from "vitest";
import { assertOfficialKioskRpc } from "./contract";

describe("kiosk api contract", () => {
  it("falha explicitamente sem fallback quando RPC oficial está ausente", () => {
    expect(() =>
      assertOfficialKioskRpc({
        rpcName: "kiosk_board_move_secure",
        allowFallback: false,
        error: { message: "Could not find the function public.kiosk_board_move_secure" },
        normalizeError: (error: unknown) => new Error(String(error)),
      })
    ).toThrow(/Ambiente desatualizado/);
  });

  it("não falha quando fallback de desenvolvimento é permitido", () => {
    expect(() =>
      assertOfficialKioskRpc({
        rpcName: "kiosk_board_move_secure",
        allowFallback: true,
        error: { message: "Could not find the function public.kiosk_board_move_secure" },
        normalizeError: (error: unknown) => new Error(String(error)),
      })
    ).not.toThrow();
  });
});
