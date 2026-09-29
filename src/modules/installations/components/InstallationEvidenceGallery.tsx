import { useEffect, useState } from "react";
import type { InstallationEvidence } from "../types";
import { getEvidencePreviewUrl } from "../repositories/installationExecutionRepository";
const LABEL = { BEFORE: "Antes", DURING: "Durante", AFTER: "Depois" } as const;
function Thumb({ item }: { item: InstallationEvidence }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    if (item.asset?.object_path)
      void getEvidencePreviewUrl(item.asset.object_path)
        .then(value => alive && setUrl(value))
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [item.asset?.object_path]);
  return (
    <button
      type="button"
      className="overflow-hidden rounded-lg border text-left"
      onClick={() => url && window.open(url, "_blank", "noreferrer")}
    >
      <div className="aspect-square bg-muted">
        {url && (
          <img
            src={url}
            loading="lazy"
            className="size-full object-cover"
            alt={`Evidência ${LABEL[item.phase]}`}
          />
        )}
      </div>
      <div className="p-2 text-xs">
        <p>
          {new Date(item.created_at).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}
        </p>
        {item.note && <p className="text-muted-foreground">{item.note}</p>}
      </div>
    </button>
  );
}
export function InstallationEvidenceGallery({
  evidence,
}: {
  evidence: InstallationEvidence[];
}) {
  return (
    <div className="space-y-4">
      {(["BEFORE", "DURING", "AFTER"] as const).map(phase => (
        <section key={phase}>
          <h3 className="mb-2 text-sm font-semibold">
            {LABEL[phase]} ({evidence.filter(e => e.phase === phase).length})
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {evidence
              .filter(e => e.phase === phase)
              .map(item => (
                <Thumb key={item.id} item={item} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
