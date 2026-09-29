import type { InstallationChecklistItem, InstallationEvidence } from "../types";

export function isChecklistReady(
  items: InstallationChecklistItem[],
  phase: "PRE_START" | "COMPLETION"
) {
  const scoped = items.filter(item => item.phase === phase);
  return (
    scoped.length > 0 &&
    scoped
      .filter(item => item.is_required)
      .every(
        item =>
          item.status === "DONE" ||
          (item.status === "NOT_APPLICABLE" && item.allow_not_applicable)
      )
  );
}
export function getInstallationCompletionReadiness(
  status: string,
  items: InstallationChecklistItem[],
  evidence: InstallationEvidence[]
) {
  const pending = items.filter(
    item =>
      item.phase === "COMPLETION" &&
      item.is_required &&
      !(
        item.status === "DONE" ||
        (item.status === "NOT_APPLICABLE" && item.allow_not_applicable)
      )
  ).length;
  const checklistReady = isChecklistReady(items, "COMPLETION");
  const afterCount = evidence.filter(item => item.phase === "AFTER").length;
  const afterEvidenceReady = afterCount > 0;
  const blockers = [
    ...(pending ? [`Faltam ${pending} itens no checklist final.`] : []),
    ...(!afterEvidenceReady ? ['Foto "Depois" obrigatória.'] : []),
    ...(status !== "IN_PROGRESS"
      ? ["A instalação precisa estar em execução."]
      : []),
  ];
  return {
    ready: status === "IN_PROGRESS" && checklistReady && afterEvidenceReady,
    checklistReady,
    afterEvidenceReady,
    afterCount,
    pending,
    blockers,
  };
}
