import { Check, X } from "lucide-react";
export function InstallationCompletionReadiness({
  checklistReady,
  afterEvidenceReady,
  pending,
  afterCount,
}: {
  checklistReady: boolean;
  afterEvidenceReady: boolean;
  pending: number;
  afterCount: number;
}) {
  return (
    <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
      <p className="font-medium">Para concluir:</p>
      <p className="flex gap-2">
        {checklistReady ? (
          <Check className="size-5 text-emerald-600" />
        ) : (
          <X className="size-5 text-destructive" />
        )}
        {checklistReady
          ? "Checklist final concluído"
          : `Faltam ${pending} itens no checklist`}
      </p>
      <p className="flex gap-2">
        {afterEvidenceReady ? (
          <Check className="size-5 text-emerald-600" />
        ) : (
          <X className="size-5 text-destructive" />
        )}
        {afterEvidenceReady
          ? `${afterCount} foto(s) final(is) registrada(s)`
          : 'Foto "Depois" obrigatória'}
      </p>
    </div>
  );
}
