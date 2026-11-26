import { describe, expect, it, vi } from "vitest";
import { createDigisacReadClient, DIGISAC_INSTANCE_API } from "./readClient";

const config = { baseUrl: DIGISAC_INSTANCE_API, token: "fixture-not-a-real-token" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});

describe("Digisac read-only transport", () => {
  it("rejects missing token, invalid token, foreign hosts and arbitrary base paths", () => {
    for (const bad of [
      { ...config, token: undefined }, { ...config, token: "a\nb" },
      { ...config, baseUrl: "https://other.example/api/v1" },
      { ...config, baseUrl: DIGISAC_INSTANCE_API + "/contacts" },
      { ...config, baseUrl: "http://evolucaoimpressos.digisac.chat/api/v1" },
    ]) expect(() => createDigisacReadClient(bad)).toThrow("configuration");
  });
  it("requests the documented contact endpoint without redirects or caching", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ id: "contact-1" }));
    const client = createDigisacReadClient(config, fetcher);
    await expect(client.getContact("contact-1")).resolves.toEqual({ id: "contact-1" });
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe(DIGISAC_INSTANCE_API + "/contacts/contact-1");
    expect(options).toMatchObject({
      method: "GET", redirect: "error", cache: "no-store",
      headers: { Authorization: "Bearer fixture-not-a-real-token", Accept: "application/json" },
    });
  });
  it("filters tickets by contact using encoded query parameters", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json([]));
    await createDigisacReadClient(config, fetcher).getContactTickets("contact-1");
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe(DIGISAC_INSTANCE_API + "/tickets");
    expect(url.searchParams.get("where[contactId]")).toBe("contact-1");
  });
  it("rejects unreplaced template variables and path or query injection before fetching", () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createDigisacReadClient(config, fetcher);
    for (const invalid of ["{{contactId}}", "../users", "a?b=c", "", "https://evil.example", "a".repeat(201)]) {
      expect(() => client.getContact(invalid)).toThrow("invalid_id");
      expect(() => client.getContactTickets(invalid)).toThrow("invalid_id");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([[401,"unauthorized"],[403,"unauthorized"],[404,"not_found"],[429,"rate_limited"],[500,"unavailable"]])("sanitizes provider error %s", async (status, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ secret: "provider-private-data" }, Number(status)));
    await expect(createDigisacReadClient(config, fetcher).getContact("contact-1")).rejects.toMatchObject({ code });
  });
  it("rejects non-JSON and excessive response size", async () => {
    for (const response of [
      new Response("<html>login</html>", { headers: { "content-type": "text/html" } }),
      json({ big: "x".repeat(512 * 1024) }),
      new Response("invalid", { headers: { "content-type": "application/json" } }),
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(createDigisacReadClient(config, fetcher).getContact("contact-1")).rejects.toMatchObject({ code: "invalid_response" });
    }
  });
  it("does not propagate a fetch failure containing credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("secret token or URL"));
    await expect(createDigisacReadClient(config, fetcher).getContact("contact-1")).rejects.toMatchObject({
      code: "unavailable", message: "Digisac: unavailable",
    });
  });
});
