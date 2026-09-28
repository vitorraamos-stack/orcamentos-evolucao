import { describe, expect, it } from "vitest";
import { getOperationalNavState } from "./operationalNavState";

describe("operational navigation state", () => {
  it.each([
    ["/os", { orders: true, art: false, production: false }],
    ["/os/123e4567-e89b-12d3-a456-426614174000", { orders: true, art: false, production: false }],
    ["/os/arte", { orders: false, art: true, production: false }],
    ["/os/arte/fila", { orders: false, art: true, production: false }],
    ["/os/producao", { orders: false, art: false, production: true }],
    ["/os/producao/fila", { orders: false, art: false, production: true }],
    ["/os/kiosk", { orders: false, art: false, production: false }],
    ["/os/qualquer-slug", { orders: false, art: false, production: false }],
  ])("classifies %s", (location, expected) => {
    expect(getOperationalNavState(location)).toEqual(expected);
  });
});
