import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function DeliveryEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-8 text-center">
      <Icon className="mb-3 size-8 text-muted-foreground" aria-hidden="true" />
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 max-w-lg text-sm text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
