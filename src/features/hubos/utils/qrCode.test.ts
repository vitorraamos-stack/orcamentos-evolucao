import { describe, expect, it } from "vitest";
import { generateQrCodeDataUrl } from "./qrCode";

describe("generateQrCodeDataUrl", () => {
  it('retorna um data URL PNG para a OS "86523"', async () => {
    const result = await generateQrCodeDataUrl("86523");
    expect(result.startsWith("data:image/png;base64,")).toBe(true);
  });
});
