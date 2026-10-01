import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PackageCheck } from "lucide-react";
import { Router } from "wouter";
import { StatCard } from "./OperationalUi";

describe("StatCard", () => {
  it("supports an optional decorative icon, tone and class name", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/">
        <StatCard
          label="Material pronto"
          value={7}
          tone="success"
          icon={PackageCheck}
          className="compact-card"
        />
      </Router>
    );

    expect(html).toContain("Material pronto");
    expect(html).toContain("border-l-emerald-500");
    expect(html).toContain("compact-card");
    expect(html).toContain('aria-hidden="true"');
  });

  it("keeps an informational card non-interactive and compact", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/">
        <StatCard label="Em Arte" value={0} />
      </Router>
    );
    expect(html).not.toContain("<a");
    expect(html).toContain("min-h-[78px]");
    expect(html).toContain("gap-0");
    expect(html).toContain("py-0");
    expect(html).toContain(">0</p>");
  });

  it("renders the full compact card as an accessible SPA link", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/">
        <StatCard
          label="Material pronto"
          value={0}
          icon={PackageCheck}
          href="/os/producao/pronto"
        />
      </Router>
    );
    expect(html).toContain('href="/os/producao/pronto"');
    expect(html).toContain('aria-label="Abrir Material pronto — 0 ordens"');
    expect(html).toContain("cursor-pointer");
    expect(html).toContain("hover:shadow-md");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain('aria-hidden="true"');
  });
});
