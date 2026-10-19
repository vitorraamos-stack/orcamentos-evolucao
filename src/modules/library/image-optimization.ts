/**
 * Browser-side preparation of catalogue photographs.
 *
 * Only the optimized output is uploaded; the original remains on the user's device.
 * This is intentionally separate from production artwork and print-ready assets.
 */
export const LIBRARY_IMAGE_SOURCE_LIMIT_BYTES = 30 * 1024 * 1024;
export const LIBRARY_IMAGE_UPLOAD_LIMIT_BYTES = 8 * 1024 * 1024;
export const LIBRARY_IMAGE_TARGET_BYTES = 500 * 1024;
export const LIBRARY_IMAGE_MAX_SIDE = 1800;

export const LIBRARY_IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type OptimizedLibraryImage = {
  blob: Blob;
  mimeType: string;
  extension: string;
  originalBytes: number;
  storedBytes: number;
  width: number;
  height: number;
  optimized: boolean;
};

export function validateLibraryImageSource(file: Pick<File, "type" | "size">): void {
  if (!Object.prototype.hasOwnProperty.call(LIBRARY_IMAGE_MIME_EXTENSIONS, file.type)) {
    throw new Error("Use fotografias JPG, PNG ou WebP.");
  }
  if (file.size <= 0) throw new Error("A imagem está vazia.");
  if (file.size > LIBRARY_IMAGE_SOURCE_LIMIT_BYTES) {
    throw new Error("O arquivo original deve ter no máximo 30 MB.");
  }
}

export function fitLibraryImage(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (!(width > 0 && height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error("Não foi possível identificar as dimensões desta imagem.");
  }
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function encodeCanvas(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob && blob.size > 0 ? resolve(blob) : reject(new Error("Não foi possível comprimir a imagem.")),
      mimeType,
      quality,
    );
  });
}

/**
 * Re-encodes a single photo using WebP. Older browsers may fall back to PNG
 * through HTMLCanvasElement.toBlob; MIME and file extension always follow the
 * actual Blob returned by the browser.
 */
export async function optimizeLibraryImage(file: File): Promise<OptimizedLibraryImage> {
  validateLibraryImageSource(file);
  if (typeof createImageBitmap !== "function") {
    throw new Error("Seu navegador não suporta otimização de imagens. Atualize-o para enviar fotografias.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Não foi possível abrir esta imagem. Verifique se o arquivo está íntegro.");
  }

  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Não foi possível iniciar o processamento da imagem neste navegador.");

    const passes = [
      { maxSide: 1800, quality: 0.83 },
      { maxSide: 1800, quality: 0.73 },
      { maxSide: 1600, quality: 0.73 },
      { maxSide: 1400, quality: 0.69 },
    ];

    let best: { blob: Blob; width: number; height: number } | null = null;
    for (const pass of passes) {
      const dimensions = fitLibraryImage(bitmap.width, bitmap.height, pass.maxSide);
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const candidate = await encodeCanvas(canvas, "image/webp", pass.quality);
      if (!(candidate.type in LIBRARY_IMAGE_MIME_EXTENSIONS)) {
        throw new Error("O navegador não gerou um formato de imagem compatível.");
      }
      if (!best || candidate.size < best.blob.size) best = { blob: candidate, ...dimensions };
      if (candidate.size <= LIBRARY_IMAGE_TARGET_BYTES) break;
    }
    if (!best) throw new Error("Não foi possível otimizar a fotografia.");

    // Preserve already-efficient photos at their original quality, provided
    // they are not larger than the catalogue's maximum dimensions.
    const originalFits = Math.max(bitmap.width, bitmap.height) <= LIBRARY_IMAGE_MAX_SIDE;
    const useOriginal = originalFits && file.size <= best.blob.size && file.size <= LIBRARY_IMAGE_UPLOAD_LIMIT_BYTES;
    const blob: Blob = useOriginal ? file : best.blob;
    if (blob.size > LIBRARY_IMAGE_UPLOAD_LIMIT_BYTES) {
      throw new Error("A fotografia continua acima de 8 MB após a otimização. Experimente outra imagem.");
    }
    const mimeType = blob.type;
    const extension = LIBRARY_IMAGE_MIME_EXTENSIONS[mimeType];
    if (!extension) throw new Error("Formato de imagem não permitido.");
    return {
      blob, mimeType, extension,
      originalBytes: file.size, storedBytes: blob.size,
      width: useOriginal ? bitmap.width : best.width,
      height: useOriginal ? bitmap.height : best.height,
      optimized: !useOriginal,
    };
  } finally {
    bitmap.close();
  }
}

export function libraryImageSavings(originalBytes: number, storedBytes: number): number {
  if (originalBytes <= 0 || storedBytes >= originalBytes) return 0;
  return Math.round(100 * (1 - storedBytes / originalBytes));
}

export function displayLibraryImageBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? (bytes / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB"
    : Math.round(bytes / 1024) + " KB";
}
