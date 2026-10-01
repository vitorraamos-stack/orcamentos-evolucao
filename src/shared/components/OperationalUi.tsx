import type { ReactNode } from "react";
import {
  AlertCircle,
  ChevronRight,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import { Link } from "wouter";
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
  href,
  ariaLabel,
}: {
  label: string;
  value: number;
  tone?: "neutral" | "danger" | "warning" | "success";
  icon?: LucideIcon;
  className?: string;
  href?: string;
  ariaLabel?: string;
}) {
  const colors = {
    neutral: "border-l-blue-500",
    danger: "border-l-red-500",
    warning: "border-l-amber-500",
    success: "border-l-emerald-500",
  };
  const card = (
    <Card
      className={cn(
        "gap-0 border-l-4 py-0 shadow-sm",
        colors[tone],
        href &&
          "transition duration-150 group-hover:-translate-y-0.5 group-hover:bg-muted/20 group-hover:shadow-md group-active:scale-[0.99]",
        className
      )}
    >
      <CardContent className="flex min-h-[78px] items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-muted-foreground">
            {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
            <p className="text-xs font-medium leading-tight">{label}</p>
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
        </div>
        {href && (
          <ChevronRight
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          />
        )}
      </CardContent>
    </Card>
  );
  if (!href) return card;
  return (
    <Link
      href={href}
      aria-label={ariaLabel ?? `Abrir ${label} — ${value} ordens`}
      className="group block cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {card}
    </Link>
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
