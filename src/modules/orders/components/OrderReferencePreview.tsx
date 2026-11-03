import { useEffect, useRef, useState } from "react";
import { Image, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OsOrderLayoutAsset } from "@/features/hubos/types";

/** Preview a real authorized layout asset, never infer artwork approval. */
export function OrderReferencePreview({ asset, onRequestUrl }: {
  asset?: OsOrderLayoutAsset | null;
  onRequestUrl: (asset: OsOrderLayoutAsset) => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const image = asset?.asset_type === "LAYOUT" && asset.mime_type?.startsWith("image/") ? asset : null;
  useEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    setOpen(false);
    setUrl(null);
    setError(null);
    setBusy(false);
    setImageFailed(false);
  }, [image?.id]);
  if (!image) return null;
  const name = image.original_name?.trim() || "ReferÃªncia visual cadastrada";
  const preview = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const request = ++generation.current;
    setError(null);
    setImageFailed(false);
 ¶»§q«^