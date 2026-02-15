import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as DialogUi from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, FolderOpen, Copy } from "lucide-react";
import { createOrderEvent, fetchUserDisplayNameById, updateOrder } from "../api";
import { ART_COLUMNS, PROD_COLUMNS } from "../constants";
import type { LogisticType, OsOrder, ProductionTag } from "../types";
import { useAuth } from "@/contexts/AuthContext";
import {
  copyToClipboard,
  getNetworkBasePath,
  toFileUriFromUncPath,
} from "@/features/hubos/networkPath";

interface ServiceOrderDialogProps {
  order: OsOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (order: OsOrder) => void;
  onDelete?: (id: string) => Promise<void> | void;
}

const formatDateDisplay = (value?: string | null) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    if (year && month && day) return `${day}/${month}/${year}`;
  }
  return value;
};

const normalizeDate = (value: string) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = value.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    if (day && month && year) {
      return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }
  return null;
};

export default function ServiceOrderDialog({
  order,
  open,
  onOpenChange,
  onUpdated,
  onDelete,
}: ServiceOrderDialogProps) {
  const { user, isAdmin } = useAuth();
  const initialFocusRef = useRef<HTMLInputElement | null>(null);
  const [saleNumber, setSaleNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [logisticType, setLogisticType] = useState<LogisticType>("retirada");
  const [address, setAddress] = useState("");
  const [productionTag, setProductionTag] = useState<ProductionTag | "">("");
  const [insumosDetails, setInsumosDetails] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

  useEffect(() => {
    if (!order) return;
    setSaleNumber(order.sale_number ?? "");
    setClientName(order.client_name ?? "");
    setTitle(order.title ?? "");
    setDescription(order.description ?? "");
    setDeliveryDate(formatDateDisplay(order.delivery_date));
    setLogisticType(order.logistic_type ?? "retirada");
    setAddress(order.address ?? "");
    setProductionTag(order.production_tag ?? "");
    setInsumosDetails(order.insumos_details ?? "");
    setEditing(false);
  }, [order, open]);

  useEffect(() => {
    if (!open || !editing) return;
    const timer = window.setTimeout(() => {
      initialFocusRef.current?.focus();
    }, 10);
    return () => window.clearTimeout(timer);
  }, [open, editing]);

  useEffect(() => {
    let active = true;
    const loadCreatedByName = async () => {
      if (!order?.created_by) {
        setCreatedByName(null);
        return;
      }
      try {
        const displayName = await fetchUserDisplayNameById(order.created_by);
        if (active) setCreatedByName(displayName);
      } catch {
        if (active) setCreatedByName(order.created_by);
      }
    };
    loadCreatedByName();
    return () => {
      active = false;
    };
  }, [order?.created_by]);

  const defaultTitle = useMemo(() => [saleNumber, clientName].filter(Boolean).join(" - ").trim(), [saleNumber, clientName]);
  const isDirty = useMemo(() => {
    if (!order) return false;
    return (
      saleNumber !== (order.sale_number ?? "") ||
      clientName !== (order.client_name ?? "") ||
      title !== (order.title ?? "") ||
      description !== (order.description ?? "") ||
      deliveryDate !== formatDateDisplay(order.delivery_date) ||
      logisticType !== (order.logistic_type ?? "retirada") ||
      address !== (order.address ?? "") ||
      productionTag !== (order.production_tag ?? "") ||
      insumosDetails !== (order.insumos_details ?? "")
    );
  }, [address, clientName, deliveryDate, description, insumosDetails, logisticType, order, productionTag, saleNumber, title]);

  const networkPath = order?.folder_path ?? null;
  const networkPathDisplay = networkPath || getNetworkBasePath() || "Caminho de rede indisponível";

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && editing && isDirty) {
      setDiscardDialogOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleSave = async () => {
    if (!order) return;
    if (logisticType === "instalacao" && !address.trim()) return toast.error("Informe o endereço de instalação.");
    if (order.prod_status === "Produção" && productionTag === "AGUARDANDO_INSUMOS" && !insumosDetails.trim()) {
      return toast.error("Informe os detalhes do material necessário.");
    }
    try {
      setSaving(true);
      const payload: Partial<OsOrder> = {
        sale_number: saleNumber,
        client_name: clientName,
        title: title.trim() || defaultTitle,
        description: description || null,
        delivery_date: normalizeDate(deliveryDate),
        logistic_type: logisticType,
        address: logisticType === "retirada" ? null : address.trim() || null,
        production_tag: productionTag || null,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      };
      const updated = await updateOrder(order.id, payload);
      onUpdated(updated);
      setEditing(false);
      toast.success("OS atualizada com sucesso.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar as alterações.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPath = async () => {
    if (!networkPathDisplay) return;
    try {
      await copyToClipboard(networkPathDisplay);
      toast.success("Caminho copiado.");
    } catch {
      toast.error("Não foi possível copiar o caminho.");
    }
  };

  const handleOpenFolder = async () => {
    if (!networkPath) return;
    const fileUrl = toFileUriFromUncPath(networkPath);
    try {
      if (!fileUrl) throw new Error("invalid");
      window.open(fileUrl, "_blank", "noopener,noreferrer");
    } catch {
      await handleCopyPath();
      toast.message("Não foi possível abrir automaticamente. Caminho copiado — cole no Explorador de Arquivos.");
    }
  };

  const moveToProduction = async () => {
    if (!order) return;
    setMoving(true);
    try {
      const updated = await updateOrder(order.id, {
        art_status: "Produzir",
        prod_status: PROD_COLUMNS[0],
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      });
      await createOrderEvent({ os_id: order.id, type: "status_change", payload: { board: "producao" }, created_by: user?.id ?? null });
      onUpdated(updated);
      toast.success("Card enviado para Produção.");
      onOpenChange(false);
    } finally {
      setMoving(false);
    }
  };

  const moveBackToArt = async () => {
    if (!order) return;
    setMoving(true);
    try {
      const updated = await updateOrder(order.id, {
        art_status: ART_COLUMNS[0],
        prod_status: null,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      });
      onUpdated(updated);
      toast.success("Card movido para Arte.");
      onOpenChange(false);
    } finally {
      setMoving(false);
    }
  };

  const handleDelete = async () => {
    if (!order || !onDelete) return;
    await onDelete(order.id);
    onOpenChange(false);
  };

  return (
    <>
      <DialogUi.Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogUi.DialogContent className="flex h-[90vh] w-[95vw] max-w-6xl flex-col overflow-hidden p-0">
          <DialogUi.DialogHeader className="border-b px-6 py-4">
            <DialogUi.DialogTitle>{`OS #${order?.os_number ?? order?.sale_number ?? ""}`}</DialogUi.DialogTitle>
            <DialogUi.DialogDescription>Status atual • {order?.prod_status ?? order?.art_status} · Criado por: {createdByName || "—"}</DialogUi.DialogDescription>
          </DialogUi.DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-1"><Label>Nº da venda</Label><Input ref={initialFocusRef} value={saleNumber} onChange={e => setSaleNumber(e.target.value)} disabled={!editing} /></div>
                <div className="space-y-1"><Label>Cliente</Label><Input value={clientName} onChange={e => setClientName(e.target.value)} disabled={!editing} /></div>
                <div className="space-y-1"><Label>Data de entrega</Label><Input value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} placeholder="dd/mm/aaaa" disabled={!editing} /></div>
                <div className="space-y-2">
                  <Label>Tipo de logística</Label>
                  <RadioGroup value={logisticType} onValueChange={value => editing && setLogisticType(value as LogisticType)}>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <label className="flex items-center gap-2"><RadioGroupItem value="retirada" />Retirada</label>
                      <label className="flex items-center gap-2"><RadioGroupItem value="entrega" />Entrega</label>
                      <label className="flex items-center gap-2"><RadioGroupItem value="instalacao" />Instalação</label>
                    </div>
                  </RadioGroup>
                </div>
                {logisticType !== "retirada" && (
                  <div className="space-y-1"><Label>Endereço</Label><Input value={address} onChange={e => setAddress(e.target.value)} disabled={!editing} /></div>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-1"><Label>Descrição</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={8} disabled={!editing} /></div>
                <div className="space-y-1"><Label>Tag de direcionamento</Label><Input value={productionTag || "—"} onChange={e => setProductionTag(e.target.value as ProductionTag)} disabled={!editing} /></div>
                {order?.prod_status === "Produção" && productionTag === "AGUARDANDO_INSUMOS" && (
                  <div className="space-y-1"><Label>Detalhes de insumos</Label><Textarea value={insumosDetails} onChange={e => setInsumosDetails(e.target.value)} rows={4} disabled={!editing} /></div>
                )}
              </div>
            </div>

            <div className="mt-6 space-y-3 rounded-md border p-4">
              <Label>Anexos (opcional)</Label>
              <p className="text-sm text-muted-foreground">Arte e referências e documentos financeiros continuam disponíveis no fluxo atual da OS.</p>
            </div>

            <div className="mt-4 space-y-3 rounded-md border p-4">
              <Label>Pasta de Arte (Rede)</Label>
              <p className="truncate rounded bg-muted px-3 py-2 font-mono text-xs" title={networkPathDisplay}>{networkPathDisplay}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleCopyPath}><Copy className="mr-2 h-4 w-4" />Copiar caminho</Button>
                <Button variant="outline" onClick={handleOpenFolder} disabled={!networkPath}><FolderOpen className="mr-2 h-4 w-4" />Abrir pasta</Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-6 py-4">
            <div className="flex gap-2">
              {!order?.prod_status && <Button variant="secondary" onClick={moveToProduction} disabled={moving}>Enviar para Produção</Button>}
              {order?.prod_status && isAdmin && <Button variant="outline" onClick={moveBackToArt} disabled={moving}><ArrowLeft className="mr-2 h-4 w-4" />Voltar para Arte</Button>}
            </div>
            <div className="flex gap-2">
              {isAdmin && onDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="destructive">Excluir</Button></AlertDialogTrigger>
                  <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir OS?</AlertDialogTitle><AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                </AlertDialog>
              )}
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Fechar</Button>
              <Button variant="secondary" onClick={() => setEditing(true)} disabled={editing}>Editar</Button>
              <Button onClick={handleSave} disabled={!editing || saving}>{saving ? "Salvando..." : "Salvar alterações"}</Button>
            </div>
          </div>
        </DialogUi.DialogContent>
      </DialogUi.Dialog>

      <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>Você possui alterações pendentes nessa OS.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDiscardDialogOpen(false); onOpenChange(false); }}>Descartar e fechar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
