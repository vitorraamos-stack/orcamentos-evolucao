import type { OsLayoutAsset } from "./types";

export type LayoutPreviewKind = "pdf" | "image" | "unsupported";

const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const MIME_TO_EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

const SUPPORTED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

const extractExtension = (value?: string | null) => {
  if (!value) return null;
  const cleanValue = value.split("?")[0]?.split("#")[0] ?? "";
  const extension = cleanValue.split(".").pop()?.trim().toLowerCase();
  return extension || null;
};

const normalizeMimeType = (mimeType?: string | null) =>
  mimeType?.trim().toLowerCase() || null;

export const resolveLayoutPreviewKind = (
  asset: Pick<OsLayoutAsset, "mime_type" | "original_name" | "object_path">
) => {
  const normalizedMimeType = normalizeMimeType(asset.mime_type);
  const extension =
    (normalizedMimeType && MIME_TO_EXTENSION[normalizedMimeType]) ||
    extractExtension(asset.original_name) ||
    extractExtension(asset.object_path);

  if (normalizedMimeType === "application/pdf" || extension === "pdf") {
    return "pdf" as const;
  }

  if (
    (normalizedMimeType && IMAGE_MIME_TYPES.has(normalizedMimeType)) ||
    (extension && SUPPORTED_IMAGE_EXTENSIONS.has(extension))
  ) {
    return "image" as const;
  }

  return "unsupported" as const;
};

export const isPreviewableLayoutMimeType = (
  asset: Pick<OsLayoutAsset, "mime_type" | "original_name" | "object_path">
) => resolveLayoutPreviewKind(asset) !== "unsupported";

export const isPrintableLayoutMimeType = (
  asset: Pick<OsLayoutAsset, "mime_type" | "original_name" | "object_path">
) => resolveLayoutPreviewKind(asset) !== "unsupported";
