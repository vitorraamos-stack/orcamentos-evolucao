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
const logistics = readFileSync(new URL("../components/OrderInstallationTab.tsx", import.meta.url), "utf8");
const now = "2026-10-15T13:00:00Z";
const author: UserOption = { id: "worker-1", name: "Equipe de Arte", email: "arte@example.com" };
const user: UserOption = { id: "manager-1", name: "Gestor", email: null };

const order = {
  id: "os-fixture",
  os_number: 721,
  sale_number: "V-721",
  client_name: "Cliente Fictício",
  title: "Fachada em ACM",
  description: "Conferir a fixação antes de instalar.",
  created_at: now,
  delivery_date: "2026-10-28",
  art_status: "Produzir",
  prod_status: "Produção",
  archived: false,
  logistic_type: "instalacao",
  address: "Rua do Teste, 100",
  production_tag: null,
  insumos_details: null,
  insumos_return_notes: null,
  is_urgent: false,
} as OsOrder;

const item: OrderItem = {
  id: "item-fixture", order_id: "os-fixture", name: "Letras em PVC",
  description: "Acrílico na frente", quantity: 2, width_cm: 120, height_cm: 45,
  unit: "un", notes: null, status: "IN_PROGRESS", sort_order: 0,
  created_at: now, updated_at: now, created_by: author.id, deleted_at: null,
};

const operation: ItemOperation = {
  id: "operation-fixture", item_id: item.id, work_center: "PRINTING",
  status: "IN_PROGRESS", assigned_to: author.id, is_required: true,
  notes: "Usar perfil correto", blocked_reason: null, sort_order: 0,
  started_at: now, completed_at: null, created_at: now, updated_at: now,
};

const asset: OsOrderLayoutAsset = {
  id: "file-fixture", os_id: "os-fixture", asset_type: "LAYOUT",
  object_path: "orders/fictional-layout.png",
  original_name: "layout-revisado.png", mime_type: "image/png",
  size_bytes: 2048, storage_provider: "r2", storage_bucket: null,
  bucket: null, uploaded_at: now,
};

const comment: OrderComment = {
  id: "comment-fixture", order_id: "os-fixture", user_id: author.id,
  message: "Enviar arte para aprovação", created_at: now, updated_at: now,
  deleted_at: null, user: author,
};

const activity: OrderActivity = {
  id: "event-fixture", os_id: "os-fixture", type: "item_created",
  payload: { name: item.name }, created_by: author.id,
  created_at: now, actor: author,
};

const delivery: Delivery = {
  id: "delivery-fixture", os_id: "os-fixture", mode: "CARRIER",
  status: "IN_TRANSIT", scheduled_at: now, assigned_to: null,
  vehicle_label: null, carrier_name: "Transportadora Exemplo",
  tracking_code: "TESTE-123", recipient_name: "Recepção",
  notes: null, completed_at: null, cancelled_at: null,
  cancelled_reason: null,
};

const pickup: HubOrderFlowRow = {
  order_key: "os_orders:os-fixture", source_type: "os_orders",
  source_id: "os-fixture", avisado_at: now, avisado_by: author.id,
  retirado_at: null, retirado_by: null, updated_at: now,
};

describe("EvoluSystem — OS seven-tab fixture-based functional smoke", () => {
  it("has seven distinct tab triggers with matching content and lazy loaders", () => {
    for (const tab of ["summary", "items", "production", "installation", "files", "comments", "history"]) {
      expect(page).toContain('value="' + tab + '"');
      expect(page).toContain('<TabsContent className="evolu-detail__tab-content');
    }
    expect((page.match(/<TabsTrigger className="evolu-detail__tab"/g) ?? [])).toHaveLength(7);
    expect((page.match(/<TabsContent className="evolu-detail__tab-content/g) ?? [])).toHaveLength(7);
    expect(page).toContain("onValueChange={loadTab}");
    expect(page).toContain("config.current.loaded && !config.current.error");
  });

  it("Resumo: renders briefing and correct data without duplicating header fields", () => {
    const html = renderToStaticMarkup(<OrderSummaryTab order={order} />);
    expect(html).toContain("Conferir a fixação antes de instalar.");
    expect(html).toContain("V-721");
    expect(html).toContain("Rua do Teste, 100");
    expect(html).not.toContain("Cliente Fictício");
    expect(html).not.toContain("Prazo final");
    const flow = renderToStaticMarkup(<OrderFlowProgress order={order} />);
    expect(flow).toContain("Progresso operacional");
    expect(flow).toContain('aria-current="step"');
  });

  it("Itens: preserves item dimensions and hides editing actions from read-only users", () => {
    const view = (canEdit: boolean) => renderToStaticMarkup(
      <OrderItemsTab items={[item]} loading={false} error={null}
        canEdit={canEdit} onCreate={vi.fn()} onUpdate={vi.fn()}
        onRemove={vi.fn()} onMove={vi.fn()} />
    );
    expect(view(true)).toContain("Editar item 1: Letras em PVC");
    expect(view(true)).toContain("2 un");
    expect(view(true)).toContain("120 × 45 cm");
    expect(view(false)).not.toContain("Adicionar item");
    expect(view(false)).not.toContain("Remover item");
  });

  it("Produção: shows assigned user and status actions according to permissions", () => {
    const view = (canOperate: boolean, canManage: boolean) => renderToStaticMarkup(
      <OrderProductionTab items={[item]} operations={[operation]} users={[author, user]}
        canOperate={canOperate} canManage={canManage}
        onCreate={vi.fn()} onUpdate={vi.fn()}
        onStatus={vi.fn()} onDelete={vi.fn()} />
    );
    expect(view(true, true)).toContain("Concluir operação de Impressão");
    expect(view(true, true)).toContain("Bloquear operação de Impressão");
    expect(view(true, true)).toContain("Excluir operação de Impressão");
    expect(view(false, false)).not.toContain("Concluir operação de Impressão");
    expect(view(false, false)).not.toContain("Excluir operação de Impressão");
    expect(view(true, false)).not.toContain("Excluir operação de Impressão");
    expect(operationSummary([{ ...operation, status: "COMPLETED" }])).toMatchObject({ total: 1, completed: 1 });
    expect(canConfirmOperationBlock("  ", false)).toBe(false);
    expect(canConfirmOperationBlock("Falta material", false)).toBe(true);
  });

  it("Instalação / Entrega: confirms the three logistics variants and pending states", () => {
    const sent = renderToStaticMarkup(<OrderDeliverySummary delivery={delivery} />);
    expect(sent).toContain("Em trânsito");
    expect(sent).toContain("Transportadora Exemplo");
    expect(sent).toContain("TESTE-123");
    const notified = renderToStaticMarkup(<OrderPickupSummary pickup={pickup} />);
    expect(notified).toContain("Cliente avisado");
    const pending = renderToStaticMarkup(<OrderPickupSummary pickup={null} />);
    expect(pending).toContain("Aguardando aviso");
    expect(logistics).toContain('order.logistic_type === "instalacao"');
    expect(logistics).toContain("Carregando informações de logística");
    expect(logistics).toContain("Tentar novamente");
    expect(logistics).toContain("loadInstallationsForOrder(order.id)");
  });

  it("Arquivos: shows only safe file metadata and named opening controls", () => {
    const html = renderToStaticMarkup(
      <OrderFilesTab assets={[asset]} loading={false} error={null} onOpen={vi.fn()} />
    );
    expect(html).toContain("layout-revisado.png");
    expect(html).toContain("Abrir arquivo: layout-revisado.png");
    expect(html).not.toContain("orders/fictional-layout.png");
    expect(page).toContain("fetchOsAssetDownloadUrl(asset.object_path, asset.original_name ?? undefined)");
  });

  it("Comentários: displays confirmed publication in front of older messages", () => {
    const published: OrderComment = {
      ...comment, id: "new-comment", message: "Ordem confirmada",
      created_at: "2026-10-15T14:00:00Z", user: undefined,
    };
    const data = prependPublishedComment([comment], published, author);
    expect(data.map(c => c.id)).toEqual(["new-comment", "comment-fixture"]);
    const html = renderToStaticMarkup(
      <OrderCommentsTab comments={data} loading={false} error={null}
        canComment={true} canRemoveAny={false} currentUserId={author.id}
        onCreate={vi.fn()} onUpdate={vi.fn()} onRemove={vi.fn()} />
    );
    expect(html).toContain("Ordem confirmada");
    expect(html).toContain("Equipe de Arte");
    expect(html).not.toContain("Nenhum comentário interno");
    expect(page).toContain("prependPublishedComment(value.data, created, author)");
  });

  it("Histórico: preserves received order, author and audit status", () => {
    const html = renderToStaticMarkup(
      <OrderHistoryTab
        activities={[
          { ...activity, id: "latest", type: "comment_created" },
          { ...activity, id: "prior" },
        ]}
        loading={false} error={null}
      />
    );
    expect(html).toContain("Linha do tempo da OS");
    expect(html).toContain("Registrado por");
    expect(html).toContain("Equipe de Arte");
    expect(html.indexOf("Comentário adicionado")).toBeLessThan(html.indexOf("Item criado"));
    expect(page).toContain("listOrderActivities(orderId)");
  });

  it("preserves management controls in summary only and transitions centrally", () => {
    const summary = page.indexOf('value="summary"');
    const items = page.indexOf('value="items"', summary);
    expect(summary).toBeGreaterThan(0);
    expect(items).toBeGreaterThan(summary);
    expect((page.match(/aria-label="Responsáveis e prazos"/g) ?? [])).toHaveLength(1);
    expect(page).toContain("getValidOrderTransitions({ board, from, role: hubRole");
    expect(page).toContain("canManageAny" === "not-used" ? "not-used" : "hubPermissions.isManager");
    expect(page).toContain("<ArchiveOrderDialog");
    expect(page).toContain("<DeleteOrderDialog");
  });
});
