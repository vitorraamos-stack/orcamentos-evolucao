import { describe, expect, it } from "vitest";
import {
  clearCentralReturn, consumeCentralReturn, isSameTabOrderActivation,
  markCentralDetailEntered, readCentralReturn, saveCentralReturn,
} from "./centralReturnContext";

function fakeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    key: (i: number) => Array.from(values.keys())[i] ?? null,
    getItem: k => values.get(k) ?? null,
    setItem: (k,v) => { values.set(k,v); },
    removeItem: k => { values.delete(k); },
  };
}
const base = {
  userId: "operator-a", orderId: "order-a", page: 4, search: "teste",
  quick: "overdue" as const, artStatus: "all", prodStatus: "all",
  priority: "urgent", logistics: "instalacao",
};
const now = Date.UTC(2026, 9, 26, 15);

describe("same-tab Central return context", () => {
  it("restores only after opening the exact detail, then consumes once", () => {
    const storage = fakeStorage();
    saveCentralReturn(storage, base, now);
    expect(readCentralReturn(storage, base.userId, "?quick=overdue", now + 100)).toBeNull();
    markCentralDetailEntered(storage, base.userId, base.orderId, now + 100);
    const result = readCentralReturn(storage, base.userId, "?quick=overdue", now + 200);
    expect(result).toMatchObject({ ...base, phase: "detail" });
    consumeCentralReturn(storage, result!, now + 200);
    expect(readCentralReturn(storage, base.userId, "", now + 300)).toBeNull();
  });
  it("does not restore across users, OSs, expired sessions or conflicting URL parameters", () => {
    const storage = fakeStorage();
    saveCentralReturn(storage, base, now);
    markCentralDetailEntered(storage, base.userId, "other-order", now + 5);
    expect(readCentralReturn(storage, base.userId, "", now + 6)).toBeNull();
    saveCentralReturn(storage, base, now);
    markCentralDetailEntered(storage, base.userId, base.orderId, now + 5);
    expect(readCentralReturn(storage, "operator-b", "", now + 6)).toBeNull();
    expect(readCentralReturn(storage, base.userId, "?quick=active", now + 6)).toBeNull();
    expect(readCentralReturn(storage, base.userId, "", now + 31 * 60 * 1000)).toBeNull();
  });
  it("rejects malformed storage and prevents modified-click cross-tab restoration", () => {
    const storage = fakeStorage();
    storage.setItem("evolusystem:orders-central:return-v1", "{bad");
    expect(readCentralReturn(storage, base.userId, "", now)).toBeNull();
    expect(isSameTabOrderActivation({button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false})).toBe(true);
    expect(isSameTabOrderActivation({button: 0, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false})).toBe(false);
    expect(isSameTabOrderActivation({button: 1, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false})).toBe(false);
    clearCentralReturn(storage);
    expect(storage.length).toBe(0);
  });
});
