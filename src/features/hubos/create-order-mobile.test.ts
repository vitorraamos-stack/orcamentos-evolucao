import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const form = readFileSync(new URL("../components/CreateOrderForm.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../components/create-order-mobile.css", import.meta.url), "utf8");

describe("EvoluSystem mobile OS creation", () => {
  it("keeps a compact summary accessible before the section navigation on mobile", () => {
    expect(form).toContain('className="group rounded-xl border bg-card shadow-sm lg:hidden"');
    expect(form).toContain("Resumo da OS");
    const detailsStart = form.indexOf("<details");
    const navStart = form.indexOf('<nav aria-label="Navegação entre seções da OS"');
    expect(detailsStart).toBeGreaterThan(0);
    expect(navStart).toBeGreaterThan(detailsStart);
    expect(form.match(/<Summary/g)).toHaveLength(2);
    expect(form).toContain('<aside className="hidden lg:block lg:p-0">');
    expect(form).toContain('<div className="lg:sticky lg:top-6">');
    expect(form).toContain('{completeCount}/6 concluídas');
  });

  it("keeps fields readable, with an appropriate numeric keyboard on phones", () => {
    expect(form).toContain("min-[390px]:grid-cols-2 sm:grid-cols-4");
    expect(form.match(/inputMode="decimal"/g)).toHaveLength(3);
    expect(css).toContain(".evolu-os-form [data-slot=\"input\"]");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("@media (max-width: 1023px)");
  });

  it("keeps all three actions usable within a safe-area-aware footer", () => {
    expect(form).toContain('aria-label="Ações da nova Ordem de Serviço"');
    expect(form).toContain("fixed inset-x-0 bottom-0");
    expect(form).toContain("lg:sticky");
    expect(form).toContain("pb-44 lg:grid-cols-");
    expect(form).toContain("grid grid-cols-2 gap-2 lg:mt-0 lg:flex");
    expect(form).toContain("col-span-2 min-h-11 w-full lg:w-auto");
    expect(css).toContain("env(safe-area-inset-bottom, 0px)");
    expect(form).toContain("onClick={requestClose}");
    expect(form).toContain("onClick={() => void submit(true)}");
    expect(form).toContain("onClick={() => void submit(false)}");
    expect(form).toContain("disabled={saving}");
  });
});
