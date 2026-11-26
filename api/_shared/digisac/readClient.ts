/**
 * Read-only Digisac transport for the Evolução instance.
 * SERVER ONLY: never import from frontend code or expose raw responses.
 * This adapter does not authenticate or authorize a user; callers must
 * validate an EvoluSystem actor and ticket ownership BEFORE returning data.
 * The connection and context diagnostics use this adapter.
 */
export const DIGISAC_INSTANCE_ORIGIN = "https://evolucaoimpressos.digisac.chat";
export const DIGISAC_INSTANCE_API = DIGISAC_INSTANCE_ORIGIN + "/api/v1";
const MAX_RESPONSE_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;

export class DigisacClientError extends Error {
  constructor(public readonly code: "configuration" | "invalid_id" | "unavailable" | "invalid_response" | "unauthorized" | "not_found" | "rate_limited") {
    super("Digisac: " + code);
    this.name = "DigisacClientError";
  }
}

function validateId(id: string): string {
  // Digisac identifiers are opaque, not URLs or query expressions.
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(id)) {
    throw new DigisacClientError("invalid_id");
  }
  return id;
}

function validateBase(raw: string | undefined): string {
  if (raw !== DIGISAC_INSTANCE_API && raw !== DIGISAC_INSTANCE_API + "/") {
    throw new DigisacClientError("configuration");
  }
  return DIGISAC_INSTANCE_API;
}

async function boundedJson(response: Response): Promise<unknown> {
  const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mime !== "application/json" && !mime?.endsWith("+json"))
    throw new DigisacClientError("invalid_response");
  const length = response.headers.get("content-length");
  if (length !== null && Number(length) > MAX_RESPONSE_BYTES)
    throw new DigisacClientError("invalid_response");
  if (!response.body) throw new DigisacClientError("invalid_response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new DigisacClientError("invalid_response");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch {
    await reader.cancel().catch(() => {});
    throw new DigisacClientError("invalid_response");
  } finally {
    reader.releaseLock();
  }
}

/** Transport-only: no assumptions about the unverified tenant response schema. */
export function createDigisacReadClient(
  config: { baseUrl: string | undefined; token: string | undefined },
  fetcher: typeof fetch = fetch,
) {
  const base = validateBase(config.baseUrl);
  const token = config.token;
  if (!token || token !== token.trim() || /[\r\n]/.test(token))
    throw new DigisacClientError("configuration");

  const request = async (url: URL): Promise<unknown> => {
    try {
      const response = await fetcher(url, {
        method: "GET",
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 401 || response.status === 403) throw new DigisacClientError("unauthorized");
      if (response.status === 404) throw new DigisacClientError("not_found");
      if (response.status === 429) throw new DigisacClientError("rate_limited");
      if (!response.ok) throw new DigisacClientError("unavailable");
      return await boundedJson(response);
    } catch (cause) {
      if (cause instanceof DigisacClientError) throw cause;
      // Do not expose URLs, request headers, provider bodies or customer data.
      throw new DigisacClientError("unavailable");
    }
  };

  return {
    // Documented Users list: request a minimal page solely for a server-side
    // connectivity diagnostic. Never return the provider response to the caller.
    checkConnection() {
      const url = new URL(base + "/users");
      url.searchParams.set("page", "1");
      url.searchParams.set("perPage", "1");
      return request(url);
    },
    getUser(userId: string) {
      return request(new URL(base + "/users/" + encodeURIComponent(validateId(userId))));
    },
    getTicket(ticketId: string) {
      return request(new URL(base + "/tickets/" + encodeURIComponent(validateId(ticketId))));
    },
    getContact(contactId: string) {
      return request(new URL(base + "/contacts/" + encodeURIComponent(validateId(contactId))));
    },
    // The documented endpoint filters by contact. The result is NOT proof of
    // access to any particular ticket. Validate response schema and assignment
    // server-side before using it for authorization. Never return raw results.
    getContactTickets(contactId: string) {
      const url = new URL(base + "/tickets");
      url.searchParams.set("where[contactId]", validateId(contactId));
      return request(url);
    },
  };
}

export function digisacReadClientFromEnv() {
  return createDigisacReadClient({
    baseUrl: process.env.DIGISAC_API_BASE_URL,
    token: process.env.DIGISAC_API_TOKEN,
  });
}
