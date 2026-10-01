import type { ReactNode } from "react";
import { AlertCircle, LoaderCircle, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions}
    </header>
  );
}

export function StatCard({
  label,
  value,
  tone = "neutral",
  icon: Icon,
  className,
}: {
  label: string;
  value: number;
  tone?: "neutral" | "danger" | "warning" | "success";
  icon?: LucideIcon;
  className?: string;
}) {
  const colors = {
    neutral: "border-l-blue-500",
    danger: "border-l-red-500",
    warning: "border-l-amber-500",
    success: "border-l-emerald-500",
  };
  return (
    <Card className={cn("border-l-4", colors[tone], className)}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
          <p className="text-xs font-medium leading-tight">{label}</p>
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export function LoadingState() {
  return (
    <div className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground">
      <LoaderCircle className="h-5 w-5 animate-spin" /> Carregando operação…
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
      <AlertCircle className="h-7 w-7 text-destructive" />
      <p>{message}</p>
      {retry && (
        <button
          className="text-sm font-medium text-primary underline"
          onClick={retry}
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <p className="font-medium">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
