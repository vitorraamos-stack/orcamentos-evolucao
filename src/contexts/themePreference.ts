export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "evolusystem-theme";

export function parseThemePreference(value: unknown, fallback: ThemePreference = "light"): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : fallback;
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  return preference === "system" ? (prefersDark ? "dark" : "light") : preference;
}
