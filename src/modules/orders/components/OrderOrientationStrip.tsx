import { AlertCircle, ArrowRight, CheckCircle2, Info } from "lucide-react";

export type OrderDetailTab = "summary" | "items" | "production" | "installation" | "files" | "comments" | "history";
export type VerifiedOrientation =
  | { kind: "next"; title: string; description: string; own: boolean; recordId: string }
  | { kind: "blocked"; reason: string; recordId: string }
  | { kind: "finished" }
  | { kind: "neutral" };

export function OrderOrientationStrip({ orientation, onNavigate }: {
  orientation: VerifiedOrientation;
  onNavigate: (tab: OrderDetailTab, recordId?: string) => void;
}) {
  const isNext = orientation.kind === "next";
  const isBlocked = orientation.kind === "blocked";
  const title = isNext ? orientation.title : isBlocked ? "Operação bloqueada" :
    orientation.kind === "finished" ? "OS finalizada" : "Nenhuma próxima ação confirmada";
  const description = isNext ? orientation.description : isBlocked ? orientation.reason :
    orientation.kind === "finished" ? "O estado final está registrado no sistema." :
    "Consulte as abas para acompanhar o andamento. Nenhuma tarefa foi presumida.";
  return (
    <section aria-label="Orientação operacional" className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3">
      {isBlocked ? <AlertCircle className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" /> :
        orientation.kind === "finished" ? <CheckCircle2 className="size-5 shrink-0 text-muted-foreground" ar���q�^