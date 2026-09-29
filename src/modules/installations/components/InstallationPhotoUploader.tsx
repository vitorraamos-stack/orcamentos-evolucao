import { useRef } from "react";
import { Camera, Images, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InstallationEvidencePhase } from "../types";
export function InstallationPhotoUploader({
  phase,
  uploading,
  disabled,
  onFile,
}: {
  phase: InstallationEvidencePhase;
  uploading: boolean;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const change = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.target.value = "";
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <input
        ref={camera}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={change}
      />
      <input
        ref={gallery}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={change}
      />
      <Button
        type="button"
        variant="outline"
        className="h-11"
        disabled={disabled || uploading}
        onClick={() => camera.current?.click()}
      >
        {uploading ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Camera className="mr-2 size-4" />
        )}
        {uploading ? "Enviando foto..." : "Tirar foto"}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        disabled={disabled || uploading}
        onClick={() => gallery.current?.click()}
      >
        <Images className="mr-2 size-4" />
        Galeria
      </Button>
      <span className="sr-only">Fase {phase}</span>
    </div>
  );
}
