import { useCallback, useEffect, useState } from "react";
import { useRoute } from "wouter";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import type { OsOrderLayoutAsset } from "@/features/hubos/types";
import { fetchOsAssetDownloadUrl } from "@/modules/hub-os/api";
import { OrderHeader } from "../components/OrderHeader";
import { OrderFlowProgress } from "../components/OrderFlowProgress";
import { OrderAssigneesCard } from "../components/OrderAssigneesCard";
import { OrderDeadlinesCard } from "../components/OrderDeadlinesCard";
import { OrderSummaryTab } from "../components/OrderSummaryTab";
import { OrderItemsTab, type ItemDraft } from "../components/OrderItemsTab";
import { OrderCommentsTab } from "../components/OrderCommentsTab";
import { OrderHistoryTab } from "../components/OrderHistoryTab";
import { OrderFilesTab } from "../components/OrderFilesTab";
import { OrderProductionTab } from "../components/OrderProductionTab";
import { OrderInstallationTab } from "../components/OrderInstallationTab";
import { OrderEditDialog, type OrderEditInput } from "../components/OrderEditDialog";
import {
  completeOrderDeadline, createOrderComment, createOrderItem, getOrderDetail, listAssignableUsers, listOrderActivities, listOrderComments, listOrderFiles, listOrderItems, recordOrderEvent, removeOrderAssignee, removeOrderComment, removeOrderDeadline, removeOrderItem, reopenOrderDeadline, reorderOrderItems, setOrderAssignee, updateOrderComment, updateOrderItem, updateOrderOperationalFields, upsertOrderDeadline,
} from "../repositories/orderDetailRepository";
import type { AssigneeScope, DeadlineScope, OrderActivity, OrderComment, OrderDetail, OrderItem, UserOption } from "../types/orderDetail";
import { getValidOrderTransitions } from "../services/orderTransitions";
import { transitionOrderStatus } from "../services/orderStatusService";
import type { ArtStatus, ProdStatus } from "@/features/hubos/types";

type LoadState<T> = { data: T; loading: boolean; error: string | null; loaded: boolean };
const state = <T,>(data: T): LoadState<T> => ({ data, loading: false, error: null, loaded: false });
const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível carregar os dados.";

export default function OrderDetailPage() {
  const [, params] = useRoute("/os/:id"); const orderId = params?.id;
  const { user, hubRole, hubPermissions } = useAuth();
  const canEditOrder = hubPermissions.isManager; const canManageAssignees = hubPermissions.isManager; const canManageDeadlines = hubPermissions.isManager; const canManageItems = hubPermissions.isManager; const canMoveArt = hubPermissions.canMoveArteBoard; const canMoveProduction = hubPermissions.canMoveProducaoBoard; const canComment = hubPermissions.canViewHubOS;
  const [detail, setDetail] = useState<OrderDetail | null>(null); const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true); const [pageError, setPageError] = useState<string | null>(null); const [editOpen, setEditOpen] = useState(false);
  const [items, setItems] = useState(state<OrderItem[]>([])); const [comments, setComments] = useState(state<OrderComment[]>([]));
  const [activities, setActivities] = useState(state<OrderActivity[]>([])); const [files, setFiles] = useState(state<OsOrderLayoutAsset[]>([]));

  const loadDetail = useCallback(async () => {
    if (!orderId) return; setLoading(true); setPageError(null);
    try { const [next, nextUsers] = await Promise.all([getOrderDetail(orderId), canManageAssignees ? listAssignableUsers() : Promise.resolve([])]); setDetail(next); setUsers(nextUsers); }
    catch (error) { setPageError(message(error)); } finally { setLoading(false); }
  }, [canManageAssignees, orderId]);
  useEffect(() => { void loadDetail(); }, [loadDetail]);

  const loadTab = useCallback(async (tab: string) => {
    if (!orderId) return;
    const configs = {
      items: { current: items, set: setItems, request: () => listOrderItems(orderId) },
      comments: { current: comments, set: setComments, request: () => listOrderComments(orderId) },
      history: { current: activities, set: setActivities, request: () => listOrderActivities(orderId) },
      files: { current: files, set: setFiles, request: () => listOrderFiles(orderId) },
    } as const;
    const config = configs[tab as keyof typeof configs] as { current: LoadState<unknown[]>; set: (value: LoadState<never[]>) => void; request: () => Promise<unknown[]> } | undefined;
    if (!config || config.current.loaded || config.current.loading) return;
    config.set({ ...config.current, loading: true } as never);
    try { const data = await config.request(); config.set({ data, loading: false, error: null, loaded: true } as never); }
    catch (error) { config.set({ ...config.current, loading: false, loaded: true, error: message(error) } as never); }
  }, [activities, comments, files, items, orderId]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-56 w-full" /><Skeleton className="h-24 w-full" /></div>;
  if (pageError || !detail) return <div className="rounded-lg border border-destructive/40 p-6"><h1 className="font-semibold">Não foi possível abrir a OS</h1><p className="mt-2 text-sm text-muted-foreground">{pageError ?? "OS não encontrada."}</p></div>;
  const event = async (type: string, payload: Record<string, unknown>) => { try { await recordOrderEvent({ orderId: detail.order.id, type, payload }); } catch (error) { console.error("Falha ao registrar auditoria", error); } };
  const updateAssignee = async (scope: AssigneeScope, userId: string) => { const from = detail.assignees.find(a => a.scope === scope)?.user_id ?? null; try { if (userId === "__unassigned__") await removeOrderAssignee(detail.order.id, scope); else await setOrderAssignee(detail.order.id, scope, userId); await event("assignee_changed", { scope, from, to: userId === "__unassigned__" ? null : userId }); await loadDetail(); toast.success("Responsável atualizado."); } catch (error) { toast.error(message(error)); } };
  const updateDeadline = async (scope: DeadlineScope, dueDate: string) => { const from = detail.deadlines.find(d => d.scope === scope)?.due_date ?? null; try { await upsertOrderDeadline(detail.order.id, scope, dueDate); await event("deadline_changed", { scope, from, to: dueDate, due_date: dueDate }); await loadDetail(); toast.success("Prazo atualizado."); } catch (error) { toast.error(message(error)); } };
  const deadlineAction = async (scope: DeadlineScope, action: "complete" | "reopen" | "remove") => { const deadline = detail.deadlines.find(item => item.scope === scope); try { if (action === "complete") await completeOrderDeadline(detail.order.id, scope); else if (action === "reopen") await reopenOrderDeadline(detail.order.id, scope); else await removeOrderDeadline(detail.order.id, scope); await event(`deadline_${action === "complete" ? "completed" : action === "reopen" ? "reopened" : "removed"}`, { scope, due_date: deadline?.due_date }); await loadDetail(); toast.success("Prazo atualizado."); } catch (error) { toast.error(message(error)); } };
  const createItem = async (draft: ItemDraft) => { try { const created = await createOrderItem(detail.order.id, draft); await event("item_created", { item_id: created.id, name: created.name }); setItems(value => ({ ...value, data: [...value.data, created] })); toast.success("Item adicionado."); } catch (error) { toast.error(message(error)); } };
  const removeItem = async (id: string) => { try { const removed = items.data.find(item => item.id === id); await removeOrderItem(id); await event("item_removed", { item_id: id, name: removed?.name }); setItems(value => ({ ...value, data: value.data.filter(item => item.id !== id) })); } catch (error) { toast.error(message(error)); } };
  const updateItem = async (id: string, input: Partial<OrderItem>) => { try { const previous = items.data.find(item => item.id === id); const updated = await updateOrderItem(id, input); const audited = ["name", "quantity", "status", "width_cm", "height_cm", "unit"] as const; const changes = Object.fromEntries(audited.filter(key => key in input && previous?.[key] !== updated[key]).map(key => [key, { from: previous?.[key] ?? null, to: updated[key] ?? null }])); await event("item_updated", { item_id: id, name: updated.name, changes }); setItems(value => ({ ...value, data: value.data.map(item => item.id === id ? updated : item) })); } catch (error) { toast.error(message(error)); } };
  const moveItem = async (index: number, direction: -1 | 1) => { const next = [...items.data]; const target = index + direction; [next[index], next[target]] = [next[target], next[index]]; const ordered = next.map((item, sort_order) => ({ ...item, sort_order })); try { await reorderOrderItems(ordered); await event("item_updated", { item_id: next[target].id, action: "reordered" }); setItems(value => ({ ...value, data: ordered })); } catch (error) { toast.error(message(error)); } };
  const createComment = async (text: string) => { try { const created = await createOrderComment(detail.order.id, text); await event("comment_created", { comment_id: created.id }); setComments(value => ({ ...value, loaded: false })); await loadTab("comments"); } catch (error) { toast.error(message(error)); } };
  const removeComment = async (id: string) => { try { await removeOrderComment(id); await event("comment_removed", { comment_id: id }); setComments(value => ({ ...value, data: value.data.filter(comment => comment.id !== id) })); } catch (error) { toast.error(message(error)); } };
  const editComment = async (id: string, text: string) => { try { const updated = await updateOrderComment(id, text); await event("comment_updated", { comment_id: id, user_id: updated.user_id }); setComments(value => ({ ...value, data: value.data.map(comment => comment.id === id ? { ...comment, message: updated.message, updated_at: updated.updated_at } : comment) })); } catch (error) { toast.error(message(error)); } };
  const saveOrder = async (input: OrderEditInput) => { try { await updateOrderOperationalFields(detail.order.id, input); await loadDetail(); toast.success("OS atualizada."); } catch (error) { toast.error(message(error)); throw error; } };
  const openAsset = async (asset: OsOrderLayoutAsset) => { try { const url = await fetchOsAssetDownloadUrl(asset.object_path, asset.original_name ?? undefined); window.open(url, "_blank", "noreferrer"); } catch (error) { toast.error(message(error)); } };

  const board: "art" | "production" = detail.order.prod_status ? "production" : "art"; const from = (detail.order.prod_status ?? detail.order.art_status) as ArtStatus | ProdStatus; const allowed = (board === "art" ? canMoveArt : canMoveProduction) ? getValidOrderTransitions({ board, from, role: hubRole, isManager: hubPermissions.isManager }).map(value => ({ board, value })) : [];
  const moveStatus = async (targetBoard: "art" | "production", to: ArtStatus | ProdStatus) => { try { const updated = await transitionOrderStatus({ orderId: detail.order.id, board: targetBoard, from, to, context: { role: hubRole, isManager: hubPermissions.isManager } }); setDetail(value => value ? { ...value, order: updated } : value); toast.success("Etapa atualizada."); } catch (error) { toast.error(message(error)); } };
  return <main className="mx-auto max-w-7xl space-y-4 pb-10"><OrderHeader order={detail.order} assignees={detail.assignees} canEdit={canEditOrder} transitions={allowed} onTransition={moveStatus} onEdit={() => setEditOpen(true)} /><OrderFlowProgress order={detail.order} /><div className="grid gap-4 xl:grid-cols-2"><OrderAssigneesCard assignees={detail.assignees} users={users} canEdit={canManageAssignees} onChange={updateAssignee} /><OrderDeadlinesCard deadlines={detail.deadlines} finalDeadline={detail.order.delivery_date} canEdit={canManageDeadlines} onChange={updateDeadline} onComplete={scope => deadlineAction(scope, "complete")} onReopen={scope => deadlineAction(scope, "reopen")} onRemove={scope => deadlineAction(scope, "remove")} /></div><Tabs defaultValue="summary" onValueChange={loadTab}><div className="overflow-x-auto"><TabsList className="w-max min-w-full justify-start"><TabsTrigger value="summary">Resumo</TabsTrigger><TabsTrigger value="items">Itens</TabsTrigger><TabsTrigger value="production">Produção</TabsTrigger><TabsTrigger value="installation">Instalação / Entrega</TabsTrigger><TabsTrigger value="files">Arquivos</TabsTrigger><TabsTrigger value="comments">Comentários</TabsTrigger><TabsTrigger value="history">Histórico</TabsTrigger></TabsList></div><TabsContent value="summary"><OrderSummaryTab order={detail.order} /></TabsContent><TabsContent value="items"><OrderItemsTab items={items.data} loading={items.loading} error={items.error} canEdit={canManageItems} onCreate={createItem} onUpdate={updateItem} onRemove={removeItem} onMove={moveItem} /></TabsContent><TabsContent value="production"><OrderProductionTab order={detail.order} /></TabsContent><TabsContent value="installation"><OrderInstallationTab order={detail.order} /></TabsContent><TabsContent value="files"><OrderFilesTab assets={files.data} loading={files.loading} error={files.error} onOpen={openAsset} /></TabsContent><TabsContent value="comments"><OrderCommentsTab comments={comments.data} loading={comments.loading} error={comments.error} currentUserId={user?.id} canComment={canComment} canRemoveAny={hubPermissions.isManager} onCreate={createComment} onUpdate={editComment} onRemove={removeComment} /></TabsContent><TabsContent value="history"><OrderHistoryTab activities={activities.data} loading={activities.loading} error={activities.error} /></TabsContent></Tabs><OrderEditDialog order={detail.order} open={editOpen} onOpenChange={setEditOpen} onSave={saveOrder} /></main>;
}
