import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Layout — regressão do erro React #310", () => {
  it("executa o hook da foto antes dos retornos de autenticação", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/Layout.tsx"), "utf8");
    const layoutStart = source.indexOf("export default function Layout(");
    const hookAt = source.indexOf("const avatarUrl = useAvatarPhoto(user?.id);", layoutStart);
    const loadingAt = source.indexOf("if (loading)", layoutStart);
    const signedOutAt = source.indexOf("if (!user) return null;", layoutStart);

    expect(layoutStart).toBeGreaterThanOrEqual(0);
    expect(hookAt).toBeGreaterThan(layoutStart);
    expect(loadingAt).toBeGreaterThan(hookAt);
    expect(signedOutAt).toBeGreaterThan(hookAt);
    expect(source.split("useAvatarPhoto(user?.id)").length - 1).toBe(1);
  });
});
