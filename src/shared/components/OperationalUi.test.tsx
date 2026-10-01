import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PackageCheck } from "lucide-react";
import { StatCard } from "./OperationalUi";

describe("StatCard", () => {
  it("supports an optional decorative icon, tone and class name", () => {
    const html = renderToStaticMarkup(
      <StatCard
        label="Material pronto"
        value={7}
        tone="success"
        icon={PackageCheck}
        className="compact-card"
      />
    );

    expect(html).toContain("Material pronto");
    expect(html).toContain("border-l-emerald-500");
    expect(html).toContain("compact-card");
    expect(html).toContain('aria-hidden="true"');
  });
});
