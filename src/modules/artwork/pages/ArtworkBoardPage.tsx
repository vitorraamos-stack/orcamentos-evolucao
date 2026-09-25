import { OperationalBoard } from "@/shared/kanban/OperationalBoard";
export default function ArtworkBoardPage({
  preset = "all",
}: {
  preset?: "all" | "approvals" | "revisions";
}) {
  return <OperationalBoard board="art" preset={preset} />;
}
