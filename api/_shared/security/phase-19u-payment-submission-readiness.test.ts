import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/modules/hub-os/pages/OsDetailPage.tsx", "utf8").replaceAll("\r\n", "\n");
const begin = source.indexOf("const handlePaymentSubmit = async () => {");
const end = source.indexOf("\n  if (loading) {", begin);
const handler = begin < 0 || end < 0 ? "" : source.slice(begin, end);

const position = (needle: string) => {
  const index = handler.indexOf(needle);
  expect(index, `Etapa ausente do fluxo financeiro: ${needle}`).toBeGreaterThanOrEqual(0);
  return index;
};

describe("19U: readiness contracts for the existing legacy payment UI (NOT E2E)", () => {
  it("finds the current handler instead of silently passing after a refactor", () => {
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(begin);
    expect(handler).toContain("paymentSchema.safeParse(");
  });

  it("inserts only a pending proof with empty attachment metadata for the first upload", () => {
    const create = position("createPaymentProof({");
    const presign = position('"r2-presign-upload"');
    expect(create).toBeLessThan(presign);
    const payload = handler.slice(create, presign);
    for (const field of ["attachment_path", "attachment_url", "storage_bucket", "r2_etag", "content_type", "size_bytes"]) {
      expect(payload).toMatch(new RegExp(`\\b${field}: null\\b`));
    }
    expect(payload).toContain('storage_provider: "r2"');
    expect(payload).toContain("created_by: user?.id ?? null");
  });

  it("uploads R2 before its one metadata UPDATE and emits an event only after attachment persistence", () => {
    const presign = position('"r2-presign-upload"');
    const put = position("const uploadResponse = await fetch(");
    const update = position("updatePaymentProof(proof.id, {");
    const event = position('type: "PAYMENT_SUBMITTED"');
    expect(presign).toBeLessThan(put);
    expect(put).toBeLessThan(update);
    expect(update).toBeLessThan(event);
    expect(handler.slice(update, event)).toContain("attachment_path: key");
    expect(handler.slice(update, event)).toContain("storage_provider: \"r2\"");
    expect((handler.match(/updatePaymentProof\(proof\.id, \{/g) ?? [])).toHaveLength(1);
  });

  it("retains the narrowly scoped initial failed-upload cleanup", () => {
    const upload = position("const uploadResponse = await fetch(");
    const catchIndex = position("} catch (error) {");
    const cleanup = position("if (createdProof && paymentFile && !uploadedKey) {");
    const removal = position("await deletePaymentProof(createdProof.id)");
    expect(upload).toBeLessThan(catchIndex);
    expect(catchIndex).toBeLessThan(cleanup);
    expect(cleanup).toBeLessThan(removal);
  });

  it("requires payment event to reference the created proof ID", () => {
    expect(handler).toContain('type: "PAYMENT_SUBMITTED"');
    expect(handler).toContain("payload: { payment_id: proof.id, status: nextStatus }");
  });
});
