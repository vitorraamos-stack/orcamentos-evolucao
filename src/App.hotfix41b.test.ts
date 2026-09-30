import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("Hotfix 4.1f dedicated creation route", () => {
  it("renders the creation page inside the protected application layout", () => {
    expect(source).toMatch(
      /<Route path="\/os\/novo">\s*<Layout>\s*<RequireModule moduleKey="hub_os">\s*<CreateOrderPage \/>/
    );
    expect(source).not.toMatch(
      /<Route path="\/os\/novo">\s*<Redirect to="\/os" \/>/
    );
  });
});
