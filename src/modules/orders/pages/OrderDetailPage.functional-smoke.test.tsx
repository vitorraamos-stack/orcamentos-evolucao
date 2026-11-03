import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OsOrder, OsOrderLayoutAsset } from "@/features/hubos/types";
import type { Delivery } from "@/modules/deliveries/types";
import type { HubOrderFlowRow } from "@/modules/hub-os/order-flow-api";
import type { ItemOperation } from "@/modules/production/operations";
import type { OrderActivity, OrderComment, OrderItem, UserOption } from "../types/orderDetail";

// Render the list without mounting the editing dialog or accessing Supabase.
vi.mock("../components/OrderItemDialog", () => ({ OrderItemDialog: () => null }));
import { OrderSummaryTab } from "../components/OrderSummaryTab";
import { OrderFlowProgress } from "../components/OrderFlowProgress";
import { OrderItemsTab } from "../components/OrderItemsTab";
import { OrderProductionTab, canConfirmOperationBlock } from "../components/OrderProductionTab";
import { OrderDeliverySummary, OrderPickupSummary } from "../components/OrderLogisticsSummary";
import { OrderFilesTab } from "../components/OrderFilesTab";
import { OrderCommentsTab } from "../components/OrderCommentsTab";
import { OrderHistoryTab } from "../components/OrderHistoryTab";
import { prependPublishedComment } from "../services/publishedComment";
import { operationSummary } from "@/modules/production/operations";

const page = readFileSync(new URL("./OrderDetailPage.tsx", import.meta.url), "utf8");
const log¶»§q«^