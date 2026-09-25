import {
  listBoardAssignees,
  listBoardOrders,
} from "@/shared/kanban/boardRepository";
export const listProductionBoardOrders = () => listBoardOrders("production");
export const listProductionAssignees = () => listBoardAssignees("production");
