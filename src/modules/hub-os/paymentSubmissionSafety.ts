import {
  MAX_ASSET_FILE_SIZE_BYTES,
  resolveAssetContentType,
  sanitizeFilename,
} from "@/features/hubos/assetUtils";

export type PaymentSubmissionStage =
  | "preflight"
  | "proof_create_started"
  | "proof_created"
  | "r2_upload_started"
  | "r2_uploaded"
  | "metadata_saved"
  | "finalization_started"
  | "complete";

export const preparePaymentFile = (file: File | null) => {
  if (!file) return null;
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error("O comprovante deve ser um arquivo válido e não vazio.");
  }
  if (file.size > MAX_ASSET_FILE_SIZE_BYTES) {
    throw new Error("Arquivo acima de 500MB.");
  }
  return {
    contentType: resolveAssetContentType(file),
    sizeBytes: file.size,
    sanitizedName: sanitizeFilename(file.name),
  };
};

export const getPaymentRecoveryPlan = (
  stage: PaymentSubmissionStage,
  fileSelected: boolean
): { safeToDeletePendingProof: boolean; manualReviewRequired: boolean } => {
  // The 19S policy, not this client, is the authoritative DELETE guard.
  // Never delete after PUT starts: a failed HTTP response is not proof of failure.
  const safeToDeletePendingProof = stage === "proof_created" && fileSelected;
  return {
    safeToDeletePendingProof,
    manualReviewRequired: stage !== "preflight" && !safeToDeletePendingProof,
  };
};
