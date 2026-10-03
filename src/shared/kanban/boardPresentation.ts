export function getBoardColumnDomId(status: string) {
  return `board-column-${status
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}`;
}
