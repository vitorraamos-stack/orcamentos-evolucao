import React, { createContext, useContext, useEffect, useState } from "react";
import {
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "./themePreference";

interface ThemeContextType {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemePreference;
  switchable?: boolean;
}

function readStoredTheme(defaultTheme: ThemePreference): ThemePreference {
  if (typeof window === "undefined") return defaultTheme;
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY), defaultTheme);
  } catch {
    return defaultTheme;
  }
}

function prefersSystemDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemePreference>(
    () => switchable ? readStoredTheme(defaultTheme) : defaultTheme,
  );
  const [systemDark, setSystemDark] = useState(prefersSystemDark);
  const resolvedTheme = resolveTheme(theme, systemDark);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    setSystemDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (!switchable) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage may be unavailable in private/restricted browsers; theme still works.
    }
  }, [theme, switchable]);

  useEffect(() => {
    if (!switchable) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        setThemeState(parseThemePreference(event.newValue, defaultTheme));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [defaultTheme, switchable]);

  const setTheme = (choice: ThemePreference) => {
    if (switchable) setThemeState(parseThemePreference(choice, defaultTheme));
  };
  const toggleTheme = switchable
    ? () => setThemeState(resolvedTheme === "dark" ? "light" : "dark")
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
