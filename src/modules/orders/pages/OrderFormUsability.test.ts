import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const creation = readFileSync(new URL("../../../features/hubos/components/CreateOrderForm.tsx", import.meta.url), "utf8");
const editing = readFileSync(new URL("../components/OrderEditDialog.tsx", import.meta.url), "utf8");

describe("EvoluSystem OS form usability", () => {
  it("provides seven accessible section shortcuts without changing the form route", () => {
    const ids = ["os-identificacao", "os-itens", "os-briefing", "os-arte-prioridade", "os-prazo", "os-logistica", "os-arquivos"];
    for (const id of ids) {
      expect(creation).toContain(`{ id: "${id}", label:`);
      expect(creation).toContain(`id="${id}"`);
    }
    expect(creation).toContain('aria-label="Navegação entre seções da OS"');
    expect(creation).toContain('type="button"');
    expect(creation).toContain('heading?.focus({ preventScroll: true })');
    expect(creation).toContain('heading?.scrollIntoView({ block: "start" })');
    expect(creation).toContain('className="grid gap-6 pb-44 lg:grid-cols-[minmax(0,1fr)_340px] lg:pb-0"');
    expect(creation).toContain('<aside className="hidden lg:block lg:p-0">');
  });

  it("adds keyboard-accessible headings and properly labelled item measurements", () => {
    expect(creation).toContain('role="region"');
    expect(creation).toContain('tabIndex={-1}');
    for (const field of ["width", "height", "description", "notes"]) {
      expect(creation).toContain(`htmlFor={\`item-\${index}-${field}\`}`);
      expect(creation).toContain(`id={\`item-\${index}-${field}\`}`);
    }
    expect(creation).toContain('aria-describedby={\`item-\${index}-quantity-error\`}');
    expect(creation).toContain('aria-invalid={Boolean(errors.artDirection)}');
    expect(creation).toContain('aria-invalid={Boolean(errors.deadline)}');
  });

  it("groups editing fields and labels dropdowns without changing the save contract", () => {
    for (const id of ["edit-os-servico", "edit-os-prazo-logistica", "edit-os-prioridade"]) {
      expect(editing).toContain(`aria-labelledby="${id}"`);
      expect(editing).toContain(`id="${id}"`);
    }
    expect(editing).toContain('htmlFor="order-logistics"');
    expect(editing).toContain('id="order-logistics"');
    expect(editing).toContain('htmlFor="order-priority"');
    expect(editing).toContain('id="order-priority"');
    expect(editing).toContain("await onSave(value)");
    expect(editing).toContain("onOpenChange(false)");
  });

  it("retains existing create-order validation and separate draft / submission actions", () => {
    expect(creation).toContain("const validate = () => {");
    expect(creation).toContain("const submit = async (draft = false)");
    expect(creation).toContain("createOrderItemInputSchema.safeParse");
    expect(creation).toContain("onClick={() => void submit(true)}");
    expect(creation).toContain("onClick={() => void submit(false)}");
  });
});
