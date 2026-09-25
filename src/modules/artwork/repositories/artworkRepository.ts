import {
  listBoardAssignees,
  listBoardOrders,
} from "@/shared/kanban/boardRepository";
export const listArtworkBoardOrders = () => listBoardOrders("art");
export const listArtworkAssignees = () => listBoardAssignees("art");
