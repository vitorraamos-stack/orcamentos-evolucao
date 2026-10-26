import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OrdersListRecovery } from "./OrdersListRecovery";

describe("Central de OS — single accessible recovery region", () => {
  it("exposes a persistent retry action on failure", () => {
    const html = renderToStaticMarkup(
      <OrdersListRecovery retrying={false} onRetry={() => undefined} />
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Não foi possível carregar as ordens");
    expect(html).toContain("Os filtros foram preservados.");
    expect(html).toContain("Tentar novamente");
  });

  it("keeps the same button focusable and marks busy retries without auto retry", () => {
    const html = renderToStaticMarkup(
      <OrdersListRecovery retrying={true} onRetry={() => undefined} />
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain(" disabled=");
    expect(html).toContain("Tentando carregar novamente");
    expect(html).toContain("Consultando…");
  });
});
