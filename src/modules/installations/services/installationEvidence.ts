import type { InstallationEvidencePhase } from "../types";
export const INSTALLATION_PHOTO_MAX_BYTES = 20 * 1024 * 1024;
export const INSTALLATION_PHOTO_MIMES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;
export const sanitizeEvidenceFilename = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "foto.jpg";
export const buildInstallationEvidencePath = (
  osId: string,
  installationId: string,
  phase: InstallationEvidencePhase,
  filename: string,
  timestamp = Date.now()
) =>
  `os_orders/${osId}/Instalacoes/${installationId}/${phase.toLowerCase()}/${timestamp}_${sanitizeEvidenceFilename(filename)}`;
export const validateInstallationPhoto = (
  file: Pick<File, "type" | "size">
) => {
  if (
    !INSTALLATION_PHOTO_MIMES.includes(
      file.type.toLowerCase() as (typeof INSTALLATION_PHOTO_MIMES)[number]
    )
  )
    throw new Error(
      "Formato não suportado. Tire a foto pela câmera ou utilize JPG/PNG/WebP."
    );
  if (!file.size || file.size > INSTALLATION_PHOTO_MAX_BYTES)
    throw new Error("A foto deve ter no máximo 20 MB.");
};
export async function prepareInstallationPhoto(file: File): Promise<File> {
  validateInstallationPhoto(file);
  if (file.size < 2 * 1024 * 1024 || typeof createImageBitmap === "undefined")
    return file;
  try {
    const image = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
    if (scale === 1) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas
      .getContext("2d")
      ?.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    if (!blob) return file;
    const prepared = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
    validateInstallationPhoto(prepared);
    return prepared;
  } catch {
    return file;
  }
}
