import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n");

describe("New order sticky summary layout", () => {
  it("removes the nested scroll context only from new order routes", () => {
    const source = read("src/components/Layout.tsx");

    expect(source).toContain(
      'const isCreateOrderPage = location.startsWith("/os/novo");'
    );
    expect(source).toContain(
      'isCreateOrderPage ? "overflow-visible" : "overflow-auto"'
    );
    expect(source).toContain('isCreateOrderPage ? "h-auto" : "h-full"');
  });

  it("keeps the summary in flow and makes only its desktop wrapper sticky", () => {
    const source = read(
      "src/features/hubos/components/CreateOrderForm.tsx"
    );

    expect(source).toContain(
      '<aside className="p-4 sm:p-6 lg:p-0">\n' +
        '          <div className="lg:sticky lg:top-6">'
    );
    expect(source).not.toContain(
      '<aside className="p-4 sm:p-6 lg:sticky lg:top-6 lg:self-start lg:p-0">'
    );
    expect(source).toContain(
      'className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"'
    );
  });
});
