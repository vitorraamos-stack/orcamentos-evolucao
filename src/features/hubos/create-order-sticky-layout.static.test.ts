import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n");

describe("New order sticky summary layout", () => {
  it("keeps new order scrolling while assigning one scroll container to OS details", () => {
    const source = read("src/components/Layout.tsx");

    expect(source).toContain(
      'const isCreateOrderPage = location.startsWith("/os/novo");'
    );
    expect(source).toContain(
      'isCreateOrderPage ? "overflow-visible" : isOrderDetailPage ? "overflow-y-auto overflow-x-hidden" : "overflow-auto"'
    );
    expect(source).toContain('isCreateOrderPage ? "h-auto" : "h-full"');
    expect(source).toContain('isOrderDetailPage && "evolu-shell--order-detail h-dvh overflow-hidden"');
  });

  it("uses the available viewport width only for new OS pages", () => {
    const source = read("src/components/Layout.tsx");
    expect(source).toContain('isCreateOrderPage && "evolu-shell--create-order"');
    expect(source).toMatch(/isOrdersCentralPage\s*\|\|\s*isCreateOrderPage\s*\|\|/);
    expect(source).toContain('isCreateOrderPage ? "h-auto" : "h-full"');
  });

  it("pins the desktop sidebar account within the viewport while the page scrolls", () => {
    const source = read("src/components/Layout.tsx");
    const css = read("src/components/evolusystem-shell.css");
    const sidebarStyles = css.slice(css.indexOf("/* New OS:"));
    expect(source).toContain("evolu-shell__navigation min-h-0 flex-1 overflow-y-auto");
    expect(sidebarStyles).toContain("@media (min-width: 768px)");
    expect(sidebarStyles).toContain(".evolu-shell--create-order .evolu-shell__sidebar");
    expect(sidebarStyles).toContain("position: sticky;");
    expect(sidebarStyles).toContain("align-self: flex-start;");
    expect(sidebarStyles).toContain("height: 100dvh;");
    expect(sidebarStyles).toContain(".evolu-shell--create-order .evolu-shell__account");
    expect(sidebarStyles).toContain("flex-shrink: 0;");
  });

  it("keeps the summary in flow and makes only its desktop wrapper sticky", () => {
    const source = read(
      "src/features/hubos/components/CreateOrderForm.tsx"
    );

    expect(source).toContain(
      '<aside className="hidden lg:block lg:p-0">\n' +
        '          <div className="lg:sticky lg:top-6">'
    );
    expect(source).not.toContain(
      '<aside className="p-4 sm:p-6 lg:sticky lg:top-6 lg:self-start lg:p-0">'
    );
    expect(source).toContain(
      'className="grid gap-6 pb-44 lg:grid-cols-[minmax(0,1fr)_340px] lg:pb-0"'
    );
    expect(source).not.toContain(
      'className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"'
    );
  });
});
