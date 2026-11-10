import { describe, expect, it } from "vitest";
import { shouldOpenOrderRow } from "./orderRowActivation";

const pointer = {
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
};
const click = (interactive = false, mods: Partial<typeof pointer> = {}, defaultPrevented = false) => ({
  defaultPrevented,
  nativeEvent: { ...pointer, ...mods },
  target: { closest: () => (interactive ? {} : null) } as unknown as EventTarget,
});

describe("Central OS — whole row activation", () => {
  it("opens on empty or descriptive row areas", () => {
    expect(shouldOpenOrderRow(click())).toBe(true);
  });
  it("preserves direct anchor, menu, and extra-item control interactions", () => {
    expect(shouldOpenOrderRow(click(true))).toBe(false);
    expect(shouldOpenOrderRow(click(false, {}, true))).toBe(false);
  });
  it("never hijacks modified, middle-click or text-selection interactions", () => {
    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }]) {
      expect(shouldOpenOrderRow(click(false, modifiers))).toBe(false);
    }
    expect(shouldOpenOrderRow(click(), "texto selecionado")).toBe(false);
  });
});
