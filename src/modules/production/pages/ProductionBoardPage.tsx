import { OperationalBoard } from "@/shared/kanban/OperationalBoard";
export default function ProductionBoardPage({
  preset = "all",
}: {
  preset?:
    | "all"
    | "printing"
    | "finishing"
    | "lettering"
    | "external"
    | "ready";
}) {
  return <OperationalBoard board="production" preset={preset} />;
}
