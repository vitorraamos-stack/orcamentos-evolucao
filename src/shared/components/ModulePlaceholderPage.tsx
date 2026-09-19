import { PageHeader } from "./OperationalUi";

export default function ModulePlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <PageHeader
        title={title}
        description="Módulo preservado na navegação operacional e planejado para uma próxima fase do Evolução OS 2.0."
      />
      <div className="rounded-lg border border-dashed bg-muted/20 p-10 text-center text-sm text-muted-foreground">
        <strong className="mb-2 block text-foreground">
          Módulo em desenvolvimento
        </strong>
        As funcionalidades serão adicionadas incrementalmente, sem comprometer o
        Hub OS atual.
      </div>
    </div>
  );
}
