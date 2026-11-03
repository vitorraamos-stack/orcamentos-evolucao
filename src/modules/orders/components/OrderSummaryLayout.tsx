import type { ReactNode } from "react";

/** Adaptative visual grouping: no changes to domain operations or permissions. */
export function OrderSummaryLayout({ content, followUp }: { content: ReactNode; followUp: ReactNode }) {
  return (
    <div className="evolu-detail__summary-layout grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(280px,1fr)] lg:items-start">
      <div aria-label="Informações da OS" className="order-2 min-w-0 space-y-4 lg:order-1">{content}</div>
      <aside aria-label="Acompanhamento da OS" className="order-1 min-w-0 lg:order-2">
        {followUp}
      </aside>
    </div>
  );
}
