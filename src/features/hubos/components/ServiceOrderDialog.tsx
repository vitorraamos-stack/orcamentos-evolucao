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
import { ArrowLeft } from "lucide-react";
import { createOrderEvent, fetchUserDisplayNameById, updateOrder } from "../api";
import { ART_COLUMNS, PROD_COLUMNS } from "../constants";
import {
  ART_DIRECTION_TAG_CONFIG,
  ART_DIRECTION_TAGS,
} from "../artDirectionTagConfig";
import type {
  ArtDirectionTag,
  LogisticType,
  OsOrder,
  ProductionTag,
} from "../types";
import { useAuth } from "@/contexts/AuthContext";

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
  const [artDirectionTag, setArtDirectionTag] = useState<ArtDirectionTag | null>(null);
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
    setArtDirectionTag(order.art_direction_tag ?? null);
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

  const defaultTitle = useMemo(
    () => [saleNumber, clientName].filter(Boolean).join(" - ").trim(),
    [saleNumber, clientName]
  );

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
      artDirectionTag !== (order.art_direction_tag ?? null) ||
      productionTag !== (order.production_tag ?? "") ||
      insumosDetails !== (order.insumos_details ?? "")
    );
  }, [
    address,
    artDirectionTag,
    clientName,
    deliveryDate,
    description,
    insumosDetails,
    logisticType,
    order,
    productionTag,
    saleNumber,
    title,
  ]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && editing && isDirty) {
      setDiscardDialogOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleSave = async () => {
    if (!order) return;

    if (logisticType === "instalacao" && !address.trim()) {
      toast.error("Informe o endereço de instalação.");
      return;
    }

    if (
      order.prod_status === "Produção" &&
      productionTag === "AGUARDANDO_INSUMOS" &&
      !insumosDetails.trim()
    ) {
      toast.error("Informe os detalhes do material necessário.");
      return;
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
        art_direction_tag: artDirectionTag,
        production_tag: productionTag || null,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      };

      if (order.prod_status === "Produção") {
        payload.insumos_details =
          productionTag === "AGUARDANDO_INSUMOS" ? insumosDetails.trim() : order.insumos_details;
      }

      const updated = await updateOrder(order.id, payload);
      onUpdated(updated);
      setEditing(false);
      toast.success("OS atualizada com sucesso.");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao salvar as alterações."
      );
    } finally {
      setSaving(false);
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
      await createOrderEvent({
        os_id: order.id,
        type: "status_change",
        payload: { board: "producao" },
        created_by: user?.id ?? null,
      });
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
        <DialogUi.DialogContent
          overlayClassName="bg-black/45 backdrop-blur-[2px]"
          className="max-h-[calc(100vh-2rem)] w-[95vw] overflow-y-auto sm:max-w-4xl lg:max-w-5xl"
        >
          <DialogUi.DialogHeader>
            <DialogUi.DialogTitle>
              {`OS #${order?.os_number ?? order?.sale_number ?? ""}`}
            </DialogUi.DialogTitle>
            <DialogUi.DialogDescription>
              Status atual • {order?.prod_status ?? order?.art_status} · Criado por: {createdByName || "—"}
            </DialogUi.DialogDescription>
          </DialogUi.DialogHeader>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Nº da venda</Label>
                <Input
                  ref={initialFocusRef}
                  value={saleNumber}
                  onChange={e => setSaleNumber(e.target.value)}
                  disabled={!editing}
                />
              </div>
              <div className="space-y-1">
                <Label>Cliente</Label>
                <Input
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  disabled={!editing}
                />
              </div>
              <div className="space-y-1">
                <Label>Data de entrega</Label>
                <Input
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                  placeholder="dd/mm/aaaa"
                  disabled={!editing}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de logística</Label>
                <RadioGroup
                  value={logisticType}
                  onValueChange={value => editing && setLogisticType(value as LogisticType)}
                  disabled={!editing}
                >
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <RadioGroupItem value="retirada" />Retirada
                    </label>
                    <label className="flex items-center gap-2">
                      <RadioGroupItem value="entrega" />Entrega
                    </label>
                    <label className="flex items-center gap-2">
                      <RadioGroupItem value="instalacao" />Instalação
                    </label>
                  </div>
                </RadioGroup>
              </div>
              {logisticType !== "retirada" && (
                <div className="space-y-1">
                  <Label>Endereço</Label>
                  <Input
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    disabled={!editing}
                  />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Descrição</Label>
                <Textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={8}
                  disabled={!editing}
                />
              </div>

              <div className="space-y-2">
                <Label>Tag de direcionamento</Label>
                <div className="flex flex-wrap gap-2">
                  {ART_DIRECTION_TAGS.map(tag => {
                    const config = ART_DIRECTION_TAG_CONFIG[tag];
                    const isSelected = artDirectionTag === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => editing && setArtDirectionTag(tag)}
                        disabled={!editing}
                        className="rounded-full border px-3 py-1 text-xs font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        style={{
                          borderColor: config.color,
                          backgroundColor: isSelected ? config.color : "transparent",
                          color: isSelected ? "#FFFFFF" : config.color,
                        }}
                      >
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {order?.prod_status === "Produção" && (
                <div className="space-y-2">
                  <Label>Tag de produção</Label>
                  <RadioGroup
                    value={productionTag}
                    onValueChange={value => editing && setProductionTag(value as ProductionTag)}
                    disabled={!editing}
                  >
                    <div className="flex flex-wrap gap-4 text-sm">
                      <label className="flex items-center gap-2"><RadioGroupItem value="EM_PRODUCAO" />Em Produção</label>
                      <label className="flex items-center gap-2"><RadioGroupItem value="AGUARDANDO_INSUMOS" />Aguardando Insumos</label>
                      <label className="flex items-center gap-2"><RadioGroupItem value="PRODUCAO_EXTERNA" />Produção Externa</label>
                      <label className="flex items-center gap-2"><RadioGroupItem value="PRONTO" />Pronto</label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {order?.prod_status === "Produção" &&
                productionTag === "AGUARDANDO_INSUMOS" && (
                  <div className="space-y-1">
                    <Label>Detalhes de insumos</Label>
                    <Textarea
                      value={insumosDetails}
                      onChange={e => setInsumosDetails(e.target.value)}
                      rows={4}
                      disabled={!editing}
                    />
                  </div>
                )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {!order?.prod_status && (
                <Button variant="secondary" onClick={moveToProduction} disabled={moving}>
                  Enviar para Produção
                </Button>
              )}
              {order?.prod_status && isAdmin && (
                <Button variant="outline" onClick={moveBackToArt} disabled={moving}>
                  <ArrowLeft className="mr-2 h-4 w-4" />Voltar para Arte
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {isAdmin && onDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">Excluir</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir OS?</AlertDialogTitle>
                      <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Fechar
              </Button>
              <Button variant="secondary" onClick={() => setEditing(true)} disabled={editing}>
                Editar
              </Button>
              <Button onClick={handleSave} disabled={!editing || saving}>
                {saving ? "Salvando..." : "Salvar alterações"}
              </Button>
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
            <AlertDialogAction
              onClick={() => {
                setDiscardDialogOpen(false);
                onOpenChange(false);
              }}
            >
              Descartar e fechar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
