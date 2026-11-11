import { describe, expect, it, vi } from "vitest";
import { handlePushStatus } from "./status";
import { hashPushEndpoint, type PushStore } from "../_shared/push/subscriptions";

const endpoint = "https://fcm.googleapis.com/fcm/send/abc12345678901234567890123";
const auth = { authorization: "Bearer " + "z".repeat(50) };
const store = (): PushStore => ({
  getUser: vi.fn().mockResolvedValue("123e4567-e89b-42d3-a456-426614174111"),
  register: vi.fn().mockResolvedValue("registered"),
  revoke: vi.fn().mockResolvedValue(true),
  status: vi.fn().mockResolvedValue(true),
});
function response() {
  const res: {
    statusCode: number;
    headers: Record<string, string>;
    body: Record<string, unknown> | null;
    setHeader: (name: string, value: string) => void;
    end: (data: string) => void;
  } = {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    end(data) { this.body = JSON.parse(data) as Record<string, unknown>; },
  };
  return res;
}

describe("PWA Push V4: status de dispositivo sem expor endpoint", () => {
  it("restringe método e exige JWT", async () => {
    const s = store();
    const first = response();
    await handlePushStatus({ method: "GET" }, first, { store: s });
    expect(first.statusCode).toBe(405);

    const second = response();
    await handlePushStatus({ method: "POST", body: { endpoint } }, second, { store: s });
    expect(second.statusCode).toBe(401);
    expect(s.getUser).not.toHaveBeenCalled();
  });

  it("consulta apenas a inscrição do titular autenticado", async () => {
    const s = store();
    const res = response();
    await handlePushStatus(
      { method: "POST", headers: auth, body: { endpoint, userId: "other-user" } },
      res, { store: s }
    );
    expect(res.body).toEqual({ ok: true, registered: true });
    expect(s.status).toHaveBeenCalledWith(
      "123e4567-e89b-42d3-a456-426614174111",
      hashPushEndpoint(endpoint)
    );
    expect(JSON.stringify(res.body)).not.toContain(endpoint);
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it("rejeita destino externo e sessão inválida", async () => {
    const s = store();
    const bad = response();
    await handlePushStatus(
      { method: "POST", headers: auth, body: { endpoint: "https://evil.example/abcd" } },
      bad, { store: s }
    );
    expect(bad.statusCode).toBe(400);
    const unauthorized = response();
    vi.mocked(s.getUser).mockResolvedValueOnce(null);
    await handlePushStatus(
      { method: "POST", headers: auth, body: { endpoint } },
      unauthorized, { store: s }
    );
    expect(unauthorized.statusCode).toBe(401);
  });

  it("não revela detalhes de falhas do banco", async () => {
    const s = store();
    const res = response();
    vi.mocked(s.status).mockRejectedValueOnce(new Error("secret-service-key"));
    await handlePushStatus(
      { method: "POST", headers: auth, body: { endpoint } },
      res, { store: s }
    );
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("secret-service-key");
  });
});
