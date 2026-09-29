import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  InstallationChecklistItem,
  InstallationChecklistStatus,
} from "../types";
export function InstallationChecklist({
  title,
  items,
  readOnly,
  onChange,
}: {
  title: string;
  items: InstallationChecklistItem[];
  readOnly: boolean;
  onChange?: (
    item: InstallationChecklistItem,
    status: InstallationChecklistStatus
  ) => void;
}) {
  const done = items.filter(i => i.status !== "PENDING").length;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-sm font-medium">
          {done}/{items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="rounded-lg border p-3">
            <button
              type="button"
              disabled={readOnly}
              aria-label={`${item.label}: ${item.status === "PENDING" ? "Pendente" : "Concluído"}`}
              className="flex min-h-11 w-full items-center gap-3 text-left disabled:cursor-default"
              onClick={() =>
                onChange?.(item, item.status === "DONE" ? "PENDING" : "DONE")
              }
            >
              {item.status === "DONE" ? (
                <Check className="size-6 text-emerald-600" />
              ) : item.status === "NOT_APPLICABLE" ? (
                <span className="w-6 text-center text-xs font-bold">N/A</span>
              ) : (
                <Circle className="size-6" />
              )}
              <span>{item.label}</span>
            </button>
            {!readOnly && item.allow_not_applicable && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-8"
                onClick={() =>
                  onChange?.(
                    item,
                    item.status === "NOT_APPLICABLE"
                      ? "PENDING"
                      : "NOT_APPLICABLE"
                  )
                }
              >
                {item.status === "NOT_APPLICABLE"
                  ? "Marcar como pendente"
                  : "Não se aplica"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
