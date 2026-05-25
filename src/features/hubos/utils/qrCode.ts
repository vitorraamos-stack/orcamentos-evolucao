import QRCode from "qrcode";

export async function generateQrCodeDataUrl(value: string): Promise<string> {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 0,
    width: 180,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}
