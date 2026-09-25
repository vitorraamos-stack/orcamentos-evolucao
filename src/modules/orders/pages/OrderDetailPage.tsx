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
  createOrderComment, createOrderItem, getOrderDetail, listAssignableUsers, listOrderActivities, listOrderComments, listOrderFiles, listOrderItems, recordOrderEvent, removeOrderComment, removeOrderItem, reorderOrderItems, setOrderAssignee, updateOrderItem, updateOrderOperationalFields, upsertOrderDeadline,
} from "../repositories/orderDetailRepository";
import type { AssigneeScope, DeadlineScope, OrderActivity, OrderComment, OrderDetail, OrderItem, UserOption } from "../types/orderDetail";

type LoadState<T> = { data: T; loading: boolean; error: string | null; loaded: boolean };
const state = <T,>(data: T): LoadState<T> => ({ data, loading: false, error: null, loaded: false });
const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível carregar os dados.";

export default function OrderDetailPage() {
  const [, params] = useRoute("/os/:id"); const orderId = params?.id;
  const { user, hubPermissions } = useAuth(); const canEdit = hubPermissions.isManager;
  const [detail, setDetail] = useState<OrderDetail | null>(null); const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true); const [pageError, setPageError] = useState<string | null>(null); const [editOpen, setEditOpen] = useState(false);
  const [items, setItems] = useState(state<OrderItem[]>([])); const [comments, setComments] = useState(state<OrderComment[]>([]));
  const [activities, setActivities] = useState(state<OrderActivity[]>([])); const [files, setFiles] = useState(state<OsOrderLayoutAsset[]>([]));

  const loadDetail = useCallback(async () => {
    if (!orderId) return; setLoading(true); setPageError(null);
    try { const [next, nextUsers] = await Promise.all([getOrderDetail(orderId), canEdit ? listAssignableUsers() : Promise.resolve([])]); setDetail(next); setUsers(nextUsers); }
    catch (error) { setPageError(message(error)); } finally { setLoading(false); }
  }, [canEdit, orderId]);
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
  const updateAssignee = async (scope: AssigneeScope, userId: string) => { const from = detail.assignees.find(a => a.scope === scope)?.user_id ?? null; try { await setOrderAssignee(detail.order.id, scope, userId); await event("assignee_changed", { scope, from, to: userId }); await loadDetail(); toast.success("Responsável atualizado."); } catch (error) { toast.error(message(error)); } };
  const updateDeadline = async (scope: DeadlineScope, dueDate: string) => { const from = detail.deadlines.find(d => d.scope === scope)?.due_date ?? null; try { await upsertOrderDeadline(detail.order.id, scope, dueDate); await event("deadline_changed", { scope, from, to: dueDate, due_date: dueDate }); await loadDetail(); toast.success("Prazo atualizado."); } catch (error) { toast.error(message(error)); } };
  const createItem = async (draft: ItemDraft) => { try { const created = await createOrderItem(detail.order.id, draft); await event("item_created", { item_id: created.id, name: created.name }); setItems(value => ({ ...value, data: [...value.data, created] })); toast.success("Item adicionado."); } catch (error) { toast.error(message(error)); } };
  const removeItem = async (id: string) => { try { const removed = items.data.find(item => item.id === id); await removeOrderItem(id); await event("item_removed", { item_id: id, name: removed?.name }); setItems(value => ({ ...value, data: value.data.filter(item => item.id !== id) })); } catch (error) { toast.error(message(error)); } };
  const updateItem = async (id: string, input: Partial<OrderItem>) => { try { const updated = await updateOrderItem(id, input); await event("item_updated", { item_id: id, fields: Object.keys(input) }); setItems(value => ({ ...value, data: value.data.map(item => item.id === id ? updated : item) })); } catch (error) { toast.error(message(error)); } };
  const moveItem = async (index: number, direction: -1 | 1) => { const next = [...items.data]; const target = index + direction; [next[index], next[target]] = [next[target], next[index]]; const ordered = next.map((item, sort_order) => ({ ...item, sort_order })); try { await reorderOrderItems(ordered); await event("item_updated", { item_id: next[target].id, action: "reordered" }); setItems(value => ({ ...value, data: ordered })); } catch (error) { toast.error(message(error)); } };
  const createComment = async (text: string) => { try { const created = await createOrderComment(detail.order.id, text); await event("comment_created", { comment_id: created.id }); setComments(value => ({ ...value, loaded: false })); await loadTab("comments"); } catch (error) { toast.error(message(error)); } };
  const removeComment = async (id: string) => { try { await removeOrderComment(id); await event("comment_removed", { comment_id: id }); setComments(value => ({ ...value, data: value.data.filter(comment => comment.id !== id) })); } catch (error) { toast.error(message(error)); } };
  const saveOrder = async (input: OrderEditInput) => { try { await updateOrderOperationalFields(detail.order.id, input); await event("details_updated", { fields: Object.keys(input) }); await loadDetail(); toast.success("OS atualizada."); } catch (error) { toast.error(message(error)); throw error; } };
  const openAsset = async (asset: OsOrderLayoutAsset) => { try { const url = await fetchOsAssetDownloadUrl(asset.object_path, asset.original_name ?? undefined); window.open(url, "_blank", "noreferrer"); } catch (error) { toast.error(message(error)); } };

  return <main className="mx-auto max-w-7xl space-y-4 pb-10"><OrderHeader order={detail.order} assignees={detail.assignees} canEdit={canEdit} onEdit={() => setEditOpen(true)} /><OrderFlowProgress order={detail.order} /><div className="grid gap-4 xl:grid-cols-2"><OrderAssigneesCard assignees={detail.assignees} users={users} canEdit={canEdit} onChange={updateAssignee} /><OrderDeadlinesCard deadlines={detail.deadlines} finalDeadline={detail.order.delivery_date} canEdit={canEdit} onChange={updateDeadline} /></div><Tabs defaultValue="summary" onValueChange={loadTab}><div className="overflow-x-auto"><TabsList className="w-max min-w-full justify-start"><TabsTrigger value="summary">Resumo</TabsTrigger><TabsTrigger value="items">Itens</TabsTrigger><TabsTrigger value="production">Produção</TabsTrigger><TabsTrigger value="installation">Instalação / Entrega</TabsTrigger><TabsTrigger value="files">Arquivos</TabsTrigger><TabsTrigger value="comments">Comentários</TabsTrigger><TabsTrigger value="history">Histórico</TabsTrigger></TabsList></div><TabsContent value="summary"><OrderSummaryTab order={detail.order} /></TabsContent><TabsContent value="items"><OrderItemsTab items={items.data} loading={items.loading} error={items.error} canEdit={canEdit} onCreate={createItem} onUpdate={updateItem} onRemove={removeItem} onMove={moveItem} /></TabsContent><TabsContent value="production"><OrderProductionTab order={detail.order} /></TabsContent><TabsContent value="installation"><OrderInstallationTab order={detail.order} /></TabsContent><TabsContent value="files"><OrderFilesTab assets={files.data} loading={files.loading} error={files.error} onOpen={openAsset} /></TabsContent><TabsContent value="comments"><OrderCommentsTab comments={comments.data} loading={comments.loading} error={comments.error} currentUserId={user?.id} onCreate={createComment} onRemove={removeComment} /></TabsContent><TabsContent value="history"><OrderHistoryTab activities={activities.data} loading={activities.loading} error={activities.error} /></TabsContent></Tabs><OrderEditDialog order={detail.order} open={editOpen} onOpenChange={setEditOpen} onSave={saveOrder} /></main>;
}

