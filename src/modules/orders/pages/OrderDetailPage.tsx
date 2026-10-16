import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, ChevronRight } from "lucide-react";
import "./order-detail-premium.css";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
import { prependPublishedComment } from "../services/publishedComment";
import { createOrderReadCoordinator } from "../services/orderReadCoordinator";
import { OrderHistoryTab } from "../components/OrderHistoryTab";
import { OrderFilesTab, openOrderFileWindow } from "../components/OrderFilesTab";
import { OrderProductionTab } from "../components/OrderProductionTab";
import { OrderInstallationTab } from "../components/OrderInstallationTab";
import { OrderEditDialog, type OrderEditInput } from "../components/OrderEditDialog";
import {
  completeOrderDeadline, createOrderComment, createOrderItem, getOrderDetail, listAssignableUsers, listOrderActivities, listOrderComments, listOrderFiles, listOrderItems, listItemOperations, createItemOperation, setItemOperationStatus, updateItemOperation, deleteItemOperation, recordOrderEvent, removeOrderAssignee, removeOrderComment, removeOrderDeadline, removeOrderItem, reopenOrderDeadline, reorderOrderItems, setOrderAssignee, updateOrderCommentIfUnchanged, updateOrderItemIfUnchanged, updateOrderOperationalFields, upsertOrderDeadline,
} from "../repositories/orderDetailRepository";
import type { AssigneeScope, DeadlineScope, OrderActivity, OrderComment, OrderDetail, OrderItem, UserOption, ItemOperation } from "../types/orderDetail";
import { getValidOrderTransitions } from "../services/orderTransitions";
import { transitionOrderStatus } from "../services/orderStatusService";
import type { ArtStatus, ProdStatus } from "@/features/hubos/types";
import { ArchiveOrderDialog } from "../components/ArchiveOrderDialog";
import { DeleteOrderDialog } from "../components/DeleteOrderDialog";
import { archiveOrderSecure, cleanupDeletedOrderStorage, deleteOrderPermanently, getOrderDeletionPreview, type OrderDeletionResult } from "../repositories/orderGovernanceRepository";
import {
  isDeletedOrderStorageCleanupComplete,
  requiresDeletedOrderStorageCleanup,
} from "../services/orderDeletionRecovery";

type LoadState<T> = { data: T; loading: boolean; error: string | null; loaded: boolean };
const state = <T,>(data: T): LoadState<T> => ({ data, loading: false, error: null, loaded: false });
const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível carregar os dados.";

export default function OrderDetailPage() {
  const [, params] = useRoute("/os/:id"); const orderId = params?.id;
  const [, navigate] = useLocation();
  const { user, hubRole, hubPermissions } = useAuth();
  const canEditOrder = hubPermissions.isManager; const canManageAssignees = hubPermissions.isManager; const canManageDeadlines = hubPermissions.isManager; const canManageItems = hubPermissions.isManager; const canMoveArt = hubPermissions.canMoveArteBoard; const canMoveProduction = hubPermissions.canMoveProducaoBoard; const canComment = hubPermissions.canViewHubOS;
  const [detail, setDetail] = useState<OrderDetail | null>(null); const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true); const [pageError, setPageError] = useState<string | null>(null); const [editOpen, setEditOpen] = useState(false);
  const [viewOrderId, setViewOrderId] = useState<string | undefined>(undefined);
  const readCoordinator = useRef(createOrderReadCoordinator());
  const [archiveOpen,setArchiveOpen]=useState(false); const [deleteOpen,setDeleteOpen]=useState(false);
  const [items, setItems] = useState(state<OrderItem[]>([])); const [comments, setComments] = useState(state<OrderComment[]>([]));
  const [activities, setActivities] = useState(state<OrderActivity[]>([])); const [files, setFiles] = useState(state<OsOrderLayoutAsset[]>([])); const [operations, setOperations] = useState(state<ItemOperation[]>([]));

  const loadDetail = useCallback(async () => {
    if (!orderId) return;
    // The latest refresh wins; an older response must never replace newer OS data.
    const ticket = readCoordinator.current.begin(orderId, "detail", true);
    if (!ticket) return;
    setLoading(true);
    setPageError(null);
    try {
      const [next, nextUsers] = await Promise.all([
        getOrderDetail(orderId),
        (canManageAssignees || canMoveProduction) ? listAssignableUsers() : Promise.resolve([]),
      ]);
      if (!readCoordinator.current.isCurrent(ticket)) return;
      setDetail(next);
      setUsers(nextUsers);
    } catch (error) {
      if (readCoordinator.current.isCurrent(ticket)) setPageError(message(error));
    } finally {
      if (readCoordinator.current.isCurrent(ticket)) setLoading(false);
      readCoordinator.current.finish(ticket);
    }
  }, [canManageAssignees, canMoveProduction, orderId]);

  useEffect(() => {
    // Never reuse tab data or request results when navigating to another OS.
    const coordinator = readCoordinator.current;
    coordinator.activate(orderId ?? null);
    setViewOrderId(orderId);
    setDetail(null);
    setUsers([]);
    setItems(state<OrderItem[]>([]));
    setComments(state<OrderComment[]>([]));
    setActivities(state<OrderActivity[]>([]));
    setFiles(state<OsOrderLayoutAsset[]>([]));
    setOperations(state<ItemOperation[]>([]));
    setLoading(true);
    setPageError(null);
    void loadDetail();
    return () => coordinator.invalidate();
  }, [orderId, loadDetail]);

  const reloadProductionData = useCallback(async () => {
    if (!orderId) return null;
    // A mutation refresh supersedes a pending tab read, without writing to the DB.
    const ticket = readCoordinator.current.begin(orderId, "production-data", true);
    if (!ticket) return null;
    try {
      const [nextItems, nextOperations] = await Promise.all([
        listOrderItems(orderId),
        listItemOperations(orderId),
      ]);
      if (!readCoordinator.current.isCurrent(ticket)) return null;
      setItems({ data: nextItems, loading: false, error: null, loaded: true });
      setOperations({ data: nextOperations, loading: false, error: null, loaded: true });
      return nextOperations;
    } finally {
      readCoordinator.current.finish(ticket);
    }
  }, [orderId]);

  const loadTab = useCallback(async (tab: string) => {
    if (!orderId) return;
    const configs = {
      items: { current: items, set: setItems, request: () => listOrderItems(orderId) },
      comments: { current: comments, set: setComments, request: () => listOrderComments(orderId) },
      history: { current: activities, set: setActivities, request: () => listOrderActivities(orderId) },
      files: { current: files, set: setFiles, request: () => listOrderFiles(orderId) },
      production: { current: operations, set: setOperations, request: async () => { return await reloadProductionData(); } },
    } as const;
    const config = configs[tab as keyof typeof configs] as { current: LoadState<unknown[]>; set: (value: LoadState<never[]>) => void; request: () => Promise<unknown[] | null> } | undefined;
    if (!config || config.current.loading || (config.current.loaded && !config.current.error)) return;
    const ticket = readCoordinator.current.begin(orderId, `tab:${tab}`);
    if (!ticket) return; // Already loading, or the user navigated to another OS.
    config.set({ ...config.current, loading: true } as never);
    try {
      const data = await config.request();
      if (!readCoordinator.current.isCurrent(ticket) || data === null) return;
      // reloadProductionData already sets both items and operations once.
      if (tab !== "production") config.set({ data, loading: false, error: null, loaded: true } as never);
    } catch (error) {
      if (readCoordinator.current.isCurrent(ticket))
        config.set({ ...config.current, loading: false, loaded: true, error: message(error) } as never);
    } finally {
      readCoordinator.current.finish(ticket);
    }
  }, [activities, comments, files, items, operations, orderId, reloadProductionData]);

  if (loading || viewOrderId !== orderId || (detail !== null && detail.order.id !== orderId)) return <div className="space-y-4"><Skeleton className="h-56 w-full" /><Skeleton className="h-24 w-full" /></div>;
  if (pageError || !detail) return <div role="alert" className="rounded-lg border border-destructive/40 p-6">
    <h1 className="font-semibold">Não foi possível abrir a OS</h1>
    <p className="mt-2 text-sm text-muted-foreground">{pageError ?? "OS não encontrada."}</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => void loadDetail()}>Tentar novamente</Button>
      <Button asChild variant="ghost" className="min-h-11 sm:min-h-9"><Link href="/os">Voltar à Central de OS</Link></Button>
    </div>
  </div>;
  const event = async (type: string, payload: Record<string, unknown>) => { try { await recordOrderEvent({ orderId: detail.order.id, type, payload }); } catch (error) { console.error("Falha ao registrar auditoria", error); } };
  const updateAssignee = async (scope: AssigneeScope, userId: string) => { const from = detail.assignees.find(a => a.scope === scope)?.user_id ?? null; try { if (userId === "__unassigned__") await removeOrderAssignee(detail.order.id, scope); else await setOrderAssignee(detail.order.id, scope, userId); await event("assignee_changed", { scope, from, to: userId === "__unassigned__" ? null : userId }); await loadDetail(); toast.success("Responsável atualizado."); } catch (error) { toast.error(message(error)); } };
  const updateDeadline = async (scope: DeadlineScope, dueDate: string) => { const from = detail.deadlines.find(d => d.scope === scope)?.due_date ?? null; try { await upsertOrderDeadline(detail.order.id, scope, dueDate); await event("deadline_changed", { scope, from, to: dueDate, due_date: dueDate }); await loadDetail(); toast.success("Prazo atualizado."); } catch (error) { toast.error(message(error)); } };
  const deadlineAction = async (scope: DeadlineScope, action: "complete" | "reopen" | "remove") => { const deadline = detail.deadlines.find(item => item.scope === scope); try { if (action === "complete") await completeOrderDeadline(detail.order.id, scope); else if (action === "reopen") await reopenOrderDeadline(detail.order.id, scope); else await removeOrderDeadline(detail.order.id, scope); await event(`deadline_${action === "complete" ? "completed" : action === "reopen" ? "reopened" : "removed"}`, { scope, due_date: deadline?.due_date }); await loadDetail(); toast.success("Prazo atualizado."); } catch (error) { toast.error(message(error)); } };
  const createItem = async (draft: ItemDraft) => { try { const created = await createOrderItem(detail.order.id, draft); await event("item_created", { item_id: created.id, name: created.name }); setItems(value => ({ ...value, data: [...value.data, created] })); toast.success("Item adicionado."); } catch (error) { toast.error(message(error)); throw error; } };
  const removeItem = async (id: string) => { try { const removed = items.data.find(item => item.id === id); await removeOrderItem(id); await event("item_removed", { item_id: id, name: removed?.name }); setItems(value => ({ ...value, data: value.data.filter(item => item.id !== id) })); } catch (error) { toast.error(message(error)); } };
  const updateItem = async (id: string, input: Partial<OrderItem>, expectedUpdatedAt: string) => { try { const previous = items.data.find(item => item.id === id); const updated = await updateOrderItemIfUnchanged(id, input, expectedUpdatedAt); const audited = ["name", "quantity", "status", "width_cm", "height_cm", "unit"] as const; const changes = Object.fromEntries(audited.filter(key => key in input && previous?.[key] !== updated[key]).map(key => [key, { from: previous?.[key] ?? null, to: updated[key] ?? null }])); await event("item_updated", { item_id: id, name: updated.name, changes }); setItems(value => ({ ...value, data: value.data.map(item => item.id === id ? updated : item) })); } catch (error) { toast.error(message(error)); throw error; } };
  const moveItem = async (index: number, direction: -1 | 1) => { const next = [...items.data]; const target = index + direction; [next[index], next[target]] = [next[target], next[index]]; const ordered = next.map((item, sort_order) => ({ ...item, sort_order })); try { await reorderOrderItems(ordered); await event("item_updated", { item_id: next[target].id, action: "reordered" }); setItems(value => ({ ...value, data: ordered })); } catch (error) { toast.error(message(error)); } };
  const createComment = async (text: string) => {
    try {
      const created = await createOrderComment(detail.order.id, text);
      const author = user ? {
        id: user.id,
        name: user.user_metadata?.full_name || user.email || "Usuário",
        email: user.email ?? null,
      } : undefined;
      setComments(value => ({
        ...value,
        data: prependPublishedComment(value.data, created, author),
        error: null,
        loaded: true,
      }));
      await event("comment_created", { comment_id: created.id });
    } catch (error) {
      toast.error(message(error));
      throw error;
    }
  };
  const removeComment = async (id: string) => { try { await removeOrderComment(id); await event("comment_removed", { comment_id: id }); setComments(value => ({ ...value, data: value.data.filter(comment => comment.id !== id) })); } catch (error) { toast.error(message(error)); throw error; } };
  const editComment = async (id: string, text: string, expectedUpdatedAt: string) => { try { const updated = await updateOrderCommentIfUnchanged(id, text, expectedUpdatedAt); await event("comment_updated", { comment_id: id, user_id: updated.user_id }); setComments(value => ({ ...value, data: value.data.map(comment => comment.id === id ? { ...comment, message: updated.message, updated_at: updated.updated_at } : comment) })); } catch (error) { toast.error(message(error)); throw error; } };
  const saveOrder = async (input: OrderEditInput) => { try { await updateOrderOperationalFields(detail.order.id, input); await loadDetail(); toast.success("OS atualizada."); } catch (error) { toast.error(message(error)); throw error; } };
  const refreshProductionAfterWrite = async (successText: string) => {
    try { const refreshed = await reloadProductionData(); if (refreshed !== null) toast.success(successText); }
    catch {
      // The write already succeeded. Ignore a failure from an OS no longer open.
      if (!orderId || !readCoordinator.current.isActive(orderId)) return;
      setOperations(value => ({ ...value, loading: false, loaded: true, error: "A alteração foi salva, mas não foi possível atualizar a lista. Use Tentar novamente para conferir o resultado." }));
      toast.warning("Alteração salva, mas a lista não foi atualizada. Tente novamente para conferir.");
    }
  };
  const openAsset = (asset: OsOrderLayoutAsset) => openOrderFileWindow(
    () => fetchOsAssetDownloadUrl(asset.object_path, asset.original_name ?? undefined),
    () => window.open("", "_blank"),
  );

  const board: "art" | "production" = detail.order.prod_status ? "production" : "art"; const from = (detail.order.prod_status ?? detail.order.art_status) as ArtStatus | ProdStatus; const allowed = (board === "art" ? canMoveArt : canMoveProduction) ? getValidOrderTransitions({ board, from, role: hubRole, isManager: hubPermissions.isManager }).map(value => ({ board, value })) : [];
  const moveStatus = async (targetBoard: "art" | "production", to: ArtStatus | ProdStatus) => { try { const updated = await transitionOrderStatus({ orderId: detail.order.id, board: targetBoard, from, to, context: { role: hubRole, isManager: hubPermissions.isManager } }); setDetail(value => value ? { ...value, order: updated } : value); toast.success("Etapa atualizada."); } catch (error) { toast.error(message(error)); } };
  const actorName=user?.user_metadata?.full_name??user?.email??user?.id??null;
  const archive=async(reason:string)=>{try{await archiveOrderSecure({id:detail.order.id,reason,actorName});toast.success("OS arquivada.");navigate("/os");}catch(error){toast.error(message(error));throw error;}};
  const deleted=async(reason:string,confirmation:string)=>deleteOrderPermanently({id:detail.order.id,reason,confirmation,actorName});
  const cleanup=async(result:OrderDeletionResult):Promise<boolean>=>{
    if(!requiresDeletedOrderStorageCleanup(result)){
      toast.success("OS excluída definitivamente.");
      navigate("/os");
      return true;
    }
    try{
      const response=await cleanupDeletedOrderStorage(result);
      if(!isDeletedOrderStorageCleanupComplete(response)){
        toast.warning("OS excluída do sistema, mas a limpeza de alguns arquivos ainda está pendente.");
        return false;
      }
      toast.success("OS e arquivos excluídos definitivamente.");
      navigate("/os");
      return true;
    }catch{
      toast.warning("OS excluída do sistema, mas a limpeza de alguns arquivos ainda está pendente.");
      return false;
    }
  };
  return <main className="evolu-detail mx-auto max-w-[1560px] space-y-4 pb-10">
    <nav className="evolu-detail__breadcrumb" aria-label="Caminho">
      <Link href="/os" className="evolu-detail__back-link">
        <ArrowLeft className="size-4" aria-hidden="true" /> Voltar à Central de OS
      </Link>
      <ChevronRight className="size-4" aria-hidden="true" />
      <span aria-current="page">OS #{detail.order.os_number ?? detail.order.sale_number}</span>
    </nav>
    <OrderHeader order={detail.order} assignees={detail.assignees} canEdit={canEditOrder} canManage={hubPermissions.isManager} onArchive={()=>setArchiveOpen(true)} onDelete={()=>setDeleteOpen(true)} transitions={allowed} onTransition={moveStatus} onEdit={() => setEditOpen(true)} />
    <OrderFlowProgress order={detail.order} />
    <Tabs className="evolu-detail__tabs" key={orderId} defaultValue="summary" onValueChange={loadTab}><div className="evolu-detail__tabs-scroll overflow-x-auto"><TabsList aria-label="Seções da ordem de serviço" className="evolu-detail__tabs-list w-max min-w-full justify-start"><TabsTrigger className="evolu-detail__tab" value="summary">Resumo</TabsTrigger><TabsTrigger className="evolu-detail__tab" value="items">Itens</TabsTrigger><TabsTrigger className="evolu-detail__tab" value="production">Produção</TabsTrigger><TabsTrigger className="evolu-detail__tab" value="installation">Instalação / Entrega</TabsTrigger><TabsTrigger className="evolu-detail__tab" value="files">Arquivos</TabsTrigger><TabsTrigger className="evolu-detail__tab" value="comments">Comentários</TabsTrigger><TabsTrigger className="evolu-detail__tab" value="history">Histórico</TabsTrigger></TabsList></div>
      <TabsContent className="evolu-detail__tab-content space-y-4" value="summary"><OrderSummaryTab order={detail.order} />
      <section aria-label="Responsáveis e prazos" className="evolu-detail__management-grid grid gap-4 xl:grid-cols-2"><OrderAssigneesCard assignees={detail.assignees} users={users} canEdit={canManageAssignees} onChange={updateAssignee} /><OrderDeadlinesCard order={detail.order} deadlines={detail.deadlines} canEdit={canManageDeadlines} onChange={updateDeadline} onComplete={scope => deadlineAction(scope, "complete")} onReopen={scope => deadlineAction(scope, "reopen")} onRemove={scope => deadlineAction(scope, "remove")} /></section></TabsContent><TabsContent className="evolu-detail__tab-content" value="items"><OrderItemsTab items={items.data} loading={items.loading} error={items.error} onRetry={() => void loadTab("items")} canEdit={canManageItems} onCreate={createItem} onUpdate={updateItem} onRemove={removeItem} onMove={moveItem} /></TabsContent><TabsContent className="evolu-detail__tab-content" value="production"><OrderProductionTab items={items.data} operations={operations.data} users={users} loading={operations.loading} error={operations.error} onRetry={() => void loadTab("production")} canOperate={canMoveProduction} canManage={hubPermissions.isManager} onCreate={async input => { await createItemOperation(input); await refreshProductionAfterWrite("Operação adicionada."); }} onUpdate={async (id,input) => { await updateItemOperation(id,input); await refreshProductionAfterWrite("Operação editada."); }} onStatus={async (id,status,reason) => { await setItemOperationStatus(id,status,reason); await refreshProductionAfterWrite("Operação atualizada."); }} onDelete={async id => { await deleteItemOperation(id); await refreshProductionAfterWrite("Operação excluída."); }} /></TabsContent><TabsContent className="evolu-detail__tab-content" value="installation"><OrderInstallationTab order={detail.order} /></TabsContent><TabsContent className="evolu-detail__tab-content" value="files"><OrderFilesTab assets={files.data} loading={files.loading} error={files.error} onRetry={() => void loadTab("files")} onOpen={openAsset} /></TabsContent><TabsContent className="evolu-detail__tab-content" value="comments"><OrderCommentsTab comments={comments.data} loading={comments.loading} error={comments.error} onRetry={() => void loadTab("comments")} currentUserId={user?.id} canComment={canComment} canRemoveAny={hubPermissions.isManager} onCreate={createComment} onUpdate={editComment} onRemove={removeComment} /></TabsContent><TabsContent className="evolu-detail__tab-content" value="history"><OrderHistoryTab activities={activities.data} loading={activities.loading} error={activities.error} onRetry={() => void loadTab("history")} /></TabsContent></Tabs>
    <OrderEditDialog order={detail.order} open={editOpen} onOpenChange={setEditOpen} onSave={saveOrder} /><ArchiveOrderDialog open={archiveOpen} onOpenChange={setArchiveOpen} onConfirm={archive}/><DeleteOrderDialog open={deleteOpen} onOpenChange={setDeleteOpen} loadPreview={()=>getOrderDeletionPreview(detail.order.id)} onDelete={deleted} onArchive={()=>{setDeleteOpen(false);setArchiveOpen(true)}} onCleanup={cleanup} onGoToCentral={()=>navigate("/os")}/></main>;
}
