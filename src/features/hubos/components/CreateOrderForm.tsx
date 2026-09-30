import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Bold,
  CalendarDays,
  Check,
  Circle,
  FileText,
  Flame,
  Italic,
  List,
  ListOrdered,
  Package,
  Plus,
  Store,
  Trash2,
  Truck,
  Underline,
  UploadCloud,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import type {
  ArtDirectionTag,
  DeliveryDeadlinePreset,
  LogisticType,
  OsOrder,
} from "../types";
import { createOrder, findOrderBySaleNumber } from "../api";
import { ART_DIRECTION_TAG_CONFIG } from "../artDirectionTagConfig";
import { ART_DIRECTION_CHOICES } from "../orderUrgency";
import {
  DELIVERY_DEADLINE_PRESET_CONFIG,
  DELIVERY_DEADLINE_PRESETS,
} from "../deliveryDeadlineConfig";
import {
  emptyOrderItem,
  getCreateOrderCompletion,
  orderItemInputSchema,
  type CreateOrderItemDraft,
} from "../createOrderDomain";
import { useAuth } from "@/contexts/AuthContext";
import {
  uploadAssetsForOrder,
  uploadFinancialDocsForOrder,
  validateFiles,
  type FinancialDoc,
  type FinancialDocType,
  type FinancialInstallmentLabel,
} from "@/features/hubos/assets";
import {
  ACCEPTED_ASSET_CONTENT_TYPES,
  MAX_ASSET_FILE_SIZE_BYTES,
} from "@/features/hubos/assetUtils";

export const OS_DRAFT_STORAGE_KEY = "hubos:create-os-draft";
const errorClass = "text-sm font-medium text-destructive";
const deadlineIcons = {
  FAST_5_8: "⚡",
  STANDARD_8_12: "●",
  STRUCTURE_INSTALL_15_25: "🏗",
  CUSTOM: "📅",
} as const;
const deadlineHints = {
  FAST_5_8: "Produção rápida",
  STANDARD_8_12: "Prazo padrão",
  STRUCTURE_INSTALL_15_25: "Estruturas",
  CUSTOM: "Definir data",
} as const;
const logistics = [
  { value: "retirada", label: "Retirada", icon: Store },
  { value: "entrega", label: "Entrega", icon: Truck },
  { value: "instalacao", label: "Instalação", icon: Wrench },
] as const;

type Errors = Record<string, string>;
type ExistingOrder = {
  id: string;
  os_number: number | null;
  sale_number: string;
  client_name: string;
  art_status: string;
  prod_status: string | null;
};

const Section = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-lg">{title}</CardTitle>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </CardHeader>
    <CardContent className="space-y-4">{children}</CardContent>
  </Card>
);
const FieldError = ({ id, children }: { id: string; children?: string }) =>
  children ? (
    <p id={id} role="alert" className={errorClass}>
      {children}
    </p>
  ) : null;

export default function CreateOrderForm({
  onCompleted,
  onCancel,
  cancelRequestToken = 0,
}: {
  onCompleted: (order: OsOrder) => void;
  onCancel: () => void;
  cancelRequestToken?: number;
}) {
  const { user } = useAuth();
  const [confirmClose, setConfirmClose] = useState(false);
  const [saleNumber, setSaleNumber] = useState(""),
    [clientName, setClientName] = useState(""),
    [description, setDescription] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(""),
    [deadline, setDeadline] = useState<DeliveryDeadlinePreset | null>(null);
  const [logisticType, setLogisticType] = useState<LogisticType>("retirada"),
    [address, setAddress] = useState("");
  const [artDirection, setArtDirection] = useState<ArtDirectionTag | null>(
      null
    ),
    [isUrgent, setIsUrgent] = useState(false);
  const [items, setItems] = useState<CreateOrderItemDraft[]>([
    emptyOrderItem(),
  ]);
  const [files, setFiles] = useState<File[]>([]),
    [financialDocs, setFinancialDocs] = useState<FinancialDoc[]>([]);
  const [errors, setErrors] = useState<Errors>({}),
    [saving, setSaving] = useState(false),
    [pendingOrder, setPendingOrder] = useState<OsOrder | null>(null);
  const [existingOrder, setExistingOrder] = useState<ExistingOrder | null>(
    null
  );
  const descriptionRef = useRef<HTMLTextAreaElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    financialRef = useRef<HTMLInputElement>(null);

  const completion = useMemo(
    () =>
      getCreateOrderCompletion({
        saleNumber,
        clientName,
        description,
        items,
        artDirectionTag: artDirection,
        deadlinePreset: deadline,
        deliveryDate,
        logisticType,
        address,
      }),
    [
      saleNumber,
      clientName,
      description,
      items,
      artDirection,
      deadline,
      deliveryDate,
      logisticType,
      address,
    ]
  );
  const completeCount = Object.values(completion).filter(Boolean).length;
  const hasData = Boolean(
    saleNumber ||
    clientName ||
    description ||
    deadline ||
    address ||
    artDirection ||
    isUrgent ||
    files.length ||
    financialDocs.length ||
    items.some(item => String(item.name).trim())
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OS_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      setSaleNumber(draft.saleNumber ?? "");
      setClientName(draft.clientName ?? "");
      setDescription(draft.description ?? "");
      setDeliveryDate(draft.deliveryDate ?? "");
      setDeadline(draft.deliveryDeadlinePreset ?? null);
      setLogisticType(draft.logisticType ?? "retirada");
      setAddress(draft.address ?? "");
      setArtDirection(draft.selectedArtDirectionTag ?? null);
      setIsUrgent(draft.isUrgent ?? false);
      setItems(
        Array.isArray(draft.items) && draft.items.length
          ? draft.items
          : [emptyOrderItem()]
      );
    } catch {
      localStorage.removeItem(OS_DRAFT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    setExistingOrder(null);
    if (!saleNumber.trim()) return;
    const timer = window.setTimeout(
      () =>
        void findOrderBySaleNumber(saleNumber)
          .then(row => setExistingOrder(row as ExistingOrder | null))
          .catch(() => undefined),
      450
    );
    return () => window.clearTimeout(timer);
  }, [saleNumber]);

  const reset = () => {
    setSaleNumber("");
    setClientName("");
    setDescription("");
    setDeliveryDate("");
    setDeadline(null);
    setLogisticType("retirada");
    setAddress("");
    setArtDirection(null);
    setIsUrgent(false);
    setItems([emptyOrderItem()]);
    setFiles([]);
    setFinancialDocs([]);
    setErrors({});
    setPendingOrder(null);
  };
  const saveLocalDraft = () =>
    localStorage.setItem(
      OS_DRAFT_STORAGE_KEY,
      JSON.stringify({
        saleNumber,
        clientName,
        description,
        deliveryDate,
        deliveryDeadlinePreset: deadline,
        logisticType,
        address,
        selectedArtDirectionTag: artDirection,
        items,
        isUrgent,
      })
    );
  const close = () => {
    setConfirmClose(false);
    reset();
    onCancel();
  };
  const requestClose = () => (hasData ? setConfirmClose(true) : close());
  const updateItem = (index: number, patch: Partial<CreateOrderItemDraft>) =>
    setItems(current =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );

  const validate = () => {
    const next: Errors = {};
    if (!saleNumber.trim()) next.saleNumber = "Informe o número da venda.";
    if (!clientName.trim()) next.clientName = "Informe o cliente.";
    if (!description.trim())
      next.description = "Informe o briefing para a Arte.";
    if (!artDirection || artDirection === "URGENTE")
      next.artDirection = "Selecione a necessidade da Arte.";
    if (!deadline) next.deadline = "Selecione o prazo de produção.";
    if (deadline === "CUSTOM" && !deliveryDate)
      next.deliveryDate = "Informe a data combinada.";
    if (logisticType !== "retirada" && !address.trim())
      next.address = "Informe o endereço do serviço.";
    if (!items.length) next.items = "Adicione pelo menos um item.";
    items.forEach((item, index) => {
      const parsed = orderItemInputSchema.safeParse({
        ...item,
        status: "PENDING",
        sort_order: index,
      });
      if (!parsed.success)
        parsed.error.issues.forEach(issue => {
          next[`item-${index}-${String(issue.path[0])}`] ??= issue.message;
        });
    });
    setErrors(next);
    if (Object.keys(next).length)
      window.setTimeout(() => {
        const element = document.querySelector<HTMLElement>(
          "[aria-invalid='true']"
        );
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
        element?.focus();
      }, 0);
    return !Object.keys(next).length;
  };

  const submit = async (draft = false) => {
    if (pendingOrder && !draft) {
      try {
        setSaving(true);
        if (files.length)
          await uploadAssetsForOrder({
            osId: pendingOrder.id,
            files,
            userId: user?.id ?? null,
          });
        if (financialDocs.length)
          await uploadFinancialDocsForOrder({
            orderId: pendingOrder.id,
            docs: financialDocs,
            userId: user?.id ?? null,
          });
        localStorage.removeItem(OS_DRAFT_STORAGE_KEY);
        toast.success("Ordem de Serviço criada com sucesso.");
        const completedOrder = pendingOrder;
        reset();
        onCompleted(completedOrder);
      } catch {
        toast.error("Não foi possível reenviar os arquivos.");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (
      !draft &&
      financialDocs.some(
        doc =>
          doc.type === "PAYMENT_PROOF" &&
          doc.installmentLabel === "1/2" &&
          !doc.secondDueDate
      )
    ) {
      toast.error("Informe a data da 2ª parcela.");
      return;
    }
    if (!draft && !validate()) {
      toast.error("Revise os campos destacados.");
      return;
    }
    const validItems = items
      .map((item, i) =>
        orderItemInputSchema.safeParse({
          ...item,
          status: "PENDING",
          sort_order: i,
        })
      )
      .filter(result => result.success)
      .map(result => result.data);
    if (draft && !hasData) {
      toast.message("Nenhum dado para salvar como rascunho.");
      return;
    }
    try {
      setSaving(true);
      const order = await createOrder({
        sale_number: saleNumber.trim() || "Rascunho",
        client_name: clientName.trim() || "Rascunho",
        title: draft ? "Rascunho" : null,
        description: description.trim() || (draft ? "Rascunho" : null),
        delivery_deadline_preset: deadline,
        delivery_deadline_started_at: null,
        delivery_date: deadline === "CUSTOM" ? deliveryDate || null : null,
        logistic_type: logisticType,
        address: logisticType === "retirada" ? null : address.trim() || null,
        art_direction_tag: artDirection,
        is_urgent: isUrgent,
        is_draft: draft,
        items: validItems.map(
          ({ status: _status, sort_order: _sort, ...item }) => item
        ),
        reproducao: false,
        letra_caixa: false,
      });
      if (draft) saveLocalDraft();
      else localStorage.removeItem(OS_DRAFT_STORAGE_KEY);
      if (!draft) {
        try {
          if (files.length)
            await uploadAssetsForOrder({
              osId: order.id,
              files,
              userId: user?.id ?? null,
            });
          if (financialDocs.length)
            await uploadFinancialDocsForOrder({
              orderId: order.id,
              docs: financialDocs,
              userId: user?.id ?? null,
            });
        } catch {
          setPendingOrder(order);
          toast.error("OS criada, mas alguns arquivos não foram enviados.");
          return;
        }
      }
      toast.success(
        draft
          ? "Rascunho salvo na Caixa de Entrada."
          : "Ordem de Serviço criada com sucesso."
      );
      reset();
      onCompleted(order);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível criar a OS."
      );
    } finally {
      setSaving(false);
    }
  };

  const addFiles = (incoming: FileList | null, financial = false) => {
    if (!incoming) return;
    const list = Array.from(incoming);
    const all = financial
      ? [...financialDocs.map(d => d.file), ...list]
      : [...files, ...list];
    const checked = validateFiles(all);
    if (!checked.ok) {
      toast.error(checked.error);
      return;
    }
    if (financial)
      setFinancialDocs(current => [
        ...current,
        ...list.map(file => ({
          file,
          type: "PAYMENT_PROOF" as const,
          installmentLabel: "1/1" as const,
          secondDueDate: null,
        })),
      ]);
    else setFiles(all);
  };
  const wrap = (before: string, after = before) => {
    const area = descriptionRef.current;
    if (!area) return;
    const start = area.selectionStart,
      end = area.selectionEnd;
    setDescription(
      description.slice(0, start) +
        before +
        description.slice(start, end) +
        after +
        description.slice(end)
    );
  };

  useEffect(() => {
    if (cancelRequestToken > 0) requestClose();
    // Each token represents an explicit request from the page header.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelRequestToken]);

  return (
    <>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="space-y-5 p-4 sm:p-6">
          <Section
            title="Informações da OS"
            subtitle="Esta OS será criada na Caixa de Entrada do setor de Arte."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="sale-number">Nº da venda *</Label>
                <Input
                  id="sale-number"
                  value={saleNumber}
                  onChange={e => setSaleNumber(e.target.value)}
                  aria-invalid={Boolean(errors.saleNumber)}
                  aria-describedby="sale-number-error"
                />
                <FieldError id="sale-number-error">
                  {errors.saleNumber}
                </FieldError>
              </div>
              <div>
                <Label htmlFor="client-name">Cliente *</Label>
                <Input
                  id="client-name"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  aria-invalid={Boolean(errors.clientName)}
                  aria-describedby="client-name-error"
                />
                <FieldError id="client-name-error">
                  {errors.clientName}
                </FieldError>
              </div>
            </div>
            {existingOrder && (
              <div
                role="status"
                className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950"
              >
                <strong>
                  Venda {existingOrder.sale_number} já possui uma OS.
                </strong>
                <p>
                  OS #{existingOrder.os_number ?? existingOrder.sale_number} ·{" "}
                  {existingOrder.client_name} ·{" "}
                  {existingOrder.prod_status ?? existingOrder.art_status}
                </p>
                <a
                  className="font-semibold underline"
                  href={`/os/${existingOrder.id}`}
                >
                  Abrir OS existente
                </a>
              </div>
            )}
          </Section>

          <Section
            title="Itens do pedido"
            subtitle="Descreva o que será produzido, sem informações comerciais."
          >
            {errors.items && (
              <FieldError id="items-error">{errors.items}</FieldError>
            )}
            {items.map((item, index) => (
              <div
                key={index}
                className="space-y-3 rounded-xl border bg-muted/20 p-4"
              >
                <div className="flex items-center justify-between">
                  <strong>Item {index + 1}</strong>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setItems(current => current.filter((_, i) => i !== index))
                    }
                    aria-label={`Excluir item ${index + 1}`}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Excluir
                  </Button>
                </div>
                <div>
                  <Label htmlFor={`item-${index}-name`}>Nome do item *</Label>
                  <Input
                    id={`item-${index}-name`}
                    value={String(item.name)}
                    onChange={e => updateItem(index, { name: e.target.value })}
                    aria-invalid={Boolean(errors[`item-${index}-name`])}
                  />
                  <FieldError id={`item-${index}-name-error`}>
                    {errors[`item-${index}-name`]}
                  </FieldError>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <Label htmlFor={`item-${index}-quantity`}>Qtd. *</Label>
                    <Input
                      id={`item-${index}-quantity`}
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={String(item.quantity)}
                      onChange={e =>
                        updateItem(index, { quantity: e.target.value })
                      }
                      aria-invalid={Boolean(errors[`item-${index}-quantity`])}
                    />
                    <FieldError id={`item-${index}-quantity-error`}>
                      {errors[`item-${index}-quantity`]}
                    </FieldError>
                  </div>
                  <div>
                    <Label>Largura (cm)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={item.width_cm == null ? "" : String(item.width_cm)}
                      onChange={e =>
                        updateItem(index, { width_cm: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Altura (cm)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={
                        item.height_cm == null ? "" : String(item.height_cm)
                      }
                      onChange={e =>
                        updateItem(index, { height_cm: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Unidade *</Label>
                    <Input
                      value={String(item.unit)}
                      onChange={e =>
                        updateItem(index, { unit: e.target.value })
                      }
                      aria-invalid={Boolean(errors[`item-${index}-unit`])}
                    />
                  </div>
                </div>
                <div>
                  <Label>Descrição / especificação</Label>
                  <Textarea
                    value={String(item.description ?? "")}
                    onChange={e =>
                      updateItem(index, { description: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Observações</Label>
                  <Input
                    value={String(item.notes ?? "")}
                    onChange={e => updateItem(index, { notes: e.target.value })}
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setItems(current => [
                  ...current,
                  { ...emptyOrderItem(), sort_order: current.length },
                ])
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar outro item
            </Button>
          </Section>

          <Section
            title="Briefing / Orientações para Arte"
            subtitle="Informe o que o setor de Arte precisa saber para executar este pedido."
          >
            <div className="rounded-md border">
              <div className="flex gap-1 border-b p-1">
                {[
                  [Bold, "Aplicar negrito", "**"],
                  [Italic, "Aplicar itálico", "*"],
                  [Underline, "Aplicar sublinhado", "__"],
                ].map(([Icon, label, marker]) => (
                  <Button
                    key={String(label)}
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={String(label)}
                    onClick={() => wrap(String(marker))}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Aplicar lista"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Aplicar lista numerada"
                >
                  <ListOrdered className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                ref={descriptionRef}
                id="briefing"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={7}
                className="border-0 focus-visible:ring-0"
                placeholder={
                  "Objetivo / o que deve ser criado:\nTextos obrigatórios:\nReferências do cliente:\nObservações importantes:"
                }
                aria-invalid={Boolean(errors.description)}
                aria-describedby="briefing-error"
              />
            </div>
            <FieldError id="briefing-error">{errors.description}</FieldError>
          </Section>

          <Section title="Arte e Prioridade">
            <div>
              <Label>Necessidade da Arte *</Label>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {ART_DIRECTION_CHOICES.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={artDirection === tag}
                    onClick={() => setArtDirection(tag)}
                    className={`rounded-xl border p-4 text-left outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring ${artDirection === tag ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                  >
                    <strong>{ART_DIRECTION_TAG_CONFIG[tag].label}</strong>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ART_DIRECTION_TAG_CONFIG[tag].text}
                    </p>
                  </button>
                ))}
              </div>
              <FieldError id="art-error">{errors.artDirection}</FieldError>
            </div>
            <div>
              <Label>Prioridade</Label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  aria-pressed={!isUrgent}
                  onClick={() => setIsUrgent(false)}
                  className={`rounded-xl border p-3 font-medium ${!isUrgent ? "border-primary bg-primary/5" : ""}`}
                >
                  <Circle className="mr-2 inline h-4 w-4" />
                  Normal
                </button>
                <button
                  type="button"
                  aria-pressed={isUrgent}
                  onClick={() => setIsUrgent(true)}
                  className={`rounded-xl border p-3 font-medium ${isUrgent ? "border-destructive bg-destructive/10 text-destructive" : ""}`}
                >
                  <Flame className="mr-2 inline h-4 w-4" />
                  Urgente
                </button>
              </div>
            </div>
          </Section>

          <Section
            title="Prazo de Produção"
            subtitle="Definido pelo Comercial/Gerência. A contagem começa após a aprovação da arte."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {DELIVERY_DEADLINE_PRESETS.map(value => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={deadline === value}
                  onClick={() => setDeadline(value)}
                  className={`rounded-xl border p-4 text-left ${deadline === value ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                >
                  <span className="text-xl" aria-hidden>
                    {deadlineIcons[value]}
                  </span>
                  <strong className="ml-2">
                    {DELIVERY_DEADLINE_PRESET_CONFIG[value].label}
                  </strong>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {deadlineHints[value]}
                  </p>
                </button>
              ))}
            </div>
            <FieldError id="deadline-error">{errors.deadline}</FieldError>
            {deadline === "CUSTOM" && (
              <div>
                <Label htmlFor="delivery-date">Data combinada *</Label>
                <Input
                  id="delivery-date"
                  type="date"
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                  aria-invalid={Boolean(errors.deliveryDate)}
                />
                <FieldError id="delivery-date-error">
                  {errors.deliveryDate}
                </FieldError>
              </div>
            )}
          </Section>

          <Section title="Logística">
            <div className="grid gap-3 sm:grid-cols-3">
              {logistics.map(({ value, label, icon: Icon }) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={logisticType === value}
                  onClick={() => setLogisticType(value)}
                  className={`rounded-xl border p-4 font-medium ${logisticType === value ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                >
                  <Icon className="mx-auto mb-2 h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>
            {logisticType !== "retirada" && (
              <div>
                <Label htmlFor="address">Endereço do serviço *</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  aria-invalid={Boolean(errors.address)}
                />
                <FieldError id="address-error">{errors.address}</FieldError>
                {logisticType === "instalacao" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Equipe e horário serão definidos posteriormente no módulo de
                    Instalações.
                  </p>
                )}
              </div>
            )}
          </Section>

          <Section
            title="Arquivos e documentos"
            subtitle={`Formatos permitidos · até ${Math.round(MAX_ASSET_FILE_SIZE_BYTES / 1024 / 1024)} MB por arquivo`}
          >
            <UploadBox
              title="Arte e referências"
              files={files}
              inputRef={fileRef}
              onFiles={list => addFiles(list)}
              onRemove={i =>
                setFiles(current => current.filter((_, index) => index !== i))
              }
            />
            <UploadBox
              title="Documentos financeiros"
              files={financialDocs.map(doc => doc.file)}
              inputRef={financialRef}
              onFiles={list => addFiles(list, true)}
              onRemove={i =>
                setFinancialDocs(current =>
                  current.filter((_, index) => index !== i)
                )
              }
            />
            {financialDocs.map((doc, index) => (
              <div
                key={`${doc.file.name}-${index}`}
                className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3"
              >
                <select
                  className="rounded-md border bg-background px-3"
                  value={doc.type}
                  onChange={e =>
                    setFinancialDocs(current =>
                      current.map((d, i) =>
                        i === index
                          ? { ...d, type: e.target.value as FinancialDocType }
                          : d
                      )
                    )
                  }
                >
                  <option value="PAYMENT_PROOF">Comprovante</option>
                  <option value="PURCHASE_ORDER">Ordem de compra</option>
                </select>
                {doc.type === "PAYMENT_PROOF" && (
                  <select
                    className="rounded-md border bg-background px-3"
                    value={doc.installmentLabel}
                    onChange={e =>
                      setFinancialDocs(current =>
                        current.map((d, i) =>
                          i === index
                            ? {
                                ...d,
                                installmentLabel: e.target
                                  .value as FinancialInstallmentLabel,
                              }
                            : d
                        )
                      )
                    }
                  >
                    <option value="1/1">1/1</option>
                    <option value="1/2">1/2</option>
                    <option value="2/2">2/2</option>
                  </select>
                )}
                {doc.type === "PAYMENT_PROOF" &&
                  doc.installmentLabel === "1/2" && (
                    <Input
                      type="date"
                      value={doc.secondDueDate ?? ""}
                      onChange={e =>
                        setFinancialDocs(current =>
                          current.map((d, i) =>
                            i === index
                              ? { ...d, secondDueDate: e.target.value }
                              : d
                          )
                        )
                      }
                    />
                  )}
              </div>
            ))}
          </Section>
        </main>
        <aside className="p-4 sm:p-6 lg:p-0">
          <Summary
            sale={saleNumber}
            client={clientName}
            items={items.length}
            art={artDirection}
            urgent={isUrgent}
            deadline={deadline}
            logisticsValue={logisticType}
            fileCount={files.length + financialDocs.length}
            completion={completion}
          />
        </aside>
      </div>
      <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <span className="text-sm text-muted-foreground">
          {completeCount}/6 seções concluídas
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={requestClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => void submit(true)}
            disabled={saving}
          >
            Salvar rascunho
          </Button>
          <Button onClick={() => void submit(false)} disabled={saving}>
            {saving
              ? "CRIANDO OS..."
              : pendingOrder
                ? "Reenviar arquivos"
                : "Criar OS"}
          </Button>
        </div>
      </footer>
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Existem informações preenchidas nesta OS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-between">
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <Button variant="outline" onClick={() => void submit(true)}>
              Salvar rascunho
            </Button>
            <AlertDialogAction onClick={close}>
              Descartar e voltar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function UploadBox({
  title,
  files,
  inputRef,
  onFiles,
  onRemove,
}: {
  title: string;
  files: File[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: FileList | null) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      <div
        className="rounded-xl border-2 border-dashed p-4 text-center"
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          onFiles(e.dataTransfer.files);
        }}
      >
        <UploadCloud className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Arraste e solte aqui ou</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => inputRef.current?.click()}
        >
          Selecionar arquivos
        </Button>
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          multiple
          accept={ACCEPTED_ASSET_CONTENT_TYPES.join(",")}
          onChange={e => onFiles(e.target.files)}
        />
      </div>
      {files.map((file, index) => (
        <div
          key={`${file.name}-${index}`}
          className="flex items-center gap-2 rounded-lg border p-2 text-sm"
        >
          <FileText className="h-4 w-4" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="text-xs text-muted-foreground">
            {(file.size / 1024).toFixed(1)} KB
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemove(index)}
            aria-label={`Remover ${file.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function Summary({
  sale,
  client,
  items,
  art,
  urgent,
  deadline,
  logisticsValue,
  fileCount,
  completion,
}: {
  sale: string;
  client: string;
  items: number;
  art: ArtDirectionTag | null;
  urgent: boolean;
  deadline: DeliveryDeadlinePreset | null;
  logisticsValue: LogisticType;
  fileCount: number;
  completion: ReturnType<typeof getCreateOrderCompletion>;
}) {
  const values = [
    ["Venda", sale || "—"],
    ["Cliente", client || "—"],
    ["Itens", `${items} ${items === 1 ? "item" : "itens"}`],
    ["Arte", art ? ART_DIRECTION_TAG_CONFIG[art].label : "—"],
    ["Prioridade", urgent ? "URGENTE" : "Normal"],
    ["Prazo", deadline ? DELIVERY_DEADLINE_PRESET_CONFIG[deadline].label : "—"],
    ["Logística", logistics.find(x => x.value === logisticsValue)?.label],
    ["Arquivos", `${fileCount} arquivo(s)`],
  ];
  return (
    <Card className="sticky top-20">
      <CardHeader>
        <CardTitle>Resumo da OS</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3">
          {values.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="my-4 border-t" />
        <div className="space-y-2">
          {Object.entries(completion).map(([key, done]) => (
            <p
              key={key}
              className={done ? "text-emerald-700" : "text-muted-foreground"}
            >
              {done ? (
                <Check className="mr-2 inline h-4 w-4" />
              ) : (
                <Circle className="mr-2 inline h-4 w-4" />
              )}
              {
                {
                  identification: "Informações",
                  items: "Itens",
                  briefing: "Briefing",
                  artwork: "Arte",
                  deadline: "Prazo",
                  logistics: "Logística",
                }[key]
              }
            </p>
          ))}
        </div>
        {urgent && (
          <Badge variant="destructive" className="mt-4">
            <Flame className="mr-1 h-3 w-3" />
            URGENTE
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
