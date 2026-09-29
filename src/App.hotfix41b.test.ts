import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("Hotfix 4.1b legacy creation route", () => {
  it("redirects /os/novo to the canonical OS central", () => {
    expect(source).toMatch(
      /<Route path="\/os\/novo">\s*<Redirect to="\/os" \/>\s*<\/Route>/
    );
    expect(source).not.toContain("<OsCreatePage />");
  });
});
