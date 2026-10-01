import { OperationalBoard } from "@/shared/kanban/OperationalBoard";
export default function ProductionBoardPage({
  preset = "all",
}: {
  preset?:
    | "all"
    | "production"
    | "printing"
    | "finishing"
    | "lettering"
    | "supplies"
    | "external"
    | "ready";
}) {
  return <OperationalBoard board="production" preset={preset} />;
}
