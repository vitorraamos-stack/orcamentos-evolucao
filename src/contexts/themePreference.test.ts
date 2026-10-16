import { describe, expect, it } from "vitest";
import { parseThemePreference, resolveTheme, THEME_STORAGE_KEY } from "./themePreference";

describe("Preferência de tema EvoluSystem", () => {
  it("mantém o modo claro para usuários sem preferência", () => {
    expect(parseThemePreference(null)).toBe("light");
  });
  it("aceita apenas preferências válidas, ignorando valores corrompidos", () => {
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("DARK")).toBe("light");
    expect(parseThemePreference("unknown", "system")).toBe("system");
  });
  it("respeita o sistema operacional apenas quando selecionado Automático", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("armazena a preferência com chave exclusiva da aplicação", () => {
    expect(THEME_STORAGE_KEY).toBe("evolusystem-theme");
  });
});
