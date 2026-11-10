import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync(new URL("./Layout.tsx", import.meta.url), "utf8");
const login = readFileSync(new URL("../pages/Login.tsx", import.meta.url), "utf8");
const logo = readFileSync(new URL("../../public/evolusystem-logo.svg", import.meta.url), "utf8");
const darkLogo = readFileSync(new URL("../../public/evolusystem-logo-dark.svg", import.meta.url), "utf8");

describe("Marca oficial EvoluSystem", () => {
  it("usa o logo vetorial no menu lateral e no cabeçalho móvel", () => {
    expect(layout.match(/evolusystem-logo-dark\.svg/g)).toHaveLength(2);
    expect(layout).toContain("/evolusystem-logo.svg");
    expect(layout).not.toContain("evolu-shell__brand-name");
  });

  it("usa os logos no login, sem a marca antiga da Evolução", () => {
    expect(login).toContain('src="/evolusystem-logo-dark.svg"');
    expect(login).not.toContain('src="/evolusystem-logo.svg"');
    expect(login).not.toContain("/logo-branca.png");
    expect(login).not.toContain("/logo.png");
  });

  it("mantém o arquivo original e uma versão contrastante para fundos escuros", () => {
    expect(logo).toContain('viewBox="0 85 1340 220"');
    expect(logo).toContain('fill="#25282B"');
    expect(darkLogo).toContain('fill="#F5F9FF"');
    expect(darkLogo).toContain('fill="#EC268F"');
    expect(darkLogo).toContain('fill="#FFF212"');
  });
});
