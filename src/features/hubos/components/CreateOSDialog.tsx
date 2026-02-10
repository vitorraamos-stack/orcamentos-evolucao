import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Underline,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import type { ArtDirectionTag, LogisticType, OsOrder } from "../types";
import { createOrder } from "../api";
import { ART_COLUMNS } from "../constants";
import {
  ART_DIRECTION_TAG_CONFIG,
  ART_DIRECTION_TAGS,
} from "../artDirectionTagConfig";
import { useAuth } from "@/contexts/AuthContext";
import {
  uploadAssetsForOrder,
  uploadFinancialDocsForOrder,
  validateFiles,
} from "@/features/hubos/assets";
import {
  ACCEPTED_ASSET_CONTENT_TYPES,
  MAX_ASSET_FILE_SIZE_BYTES,
} from "@/features/hubos/assetUtils";
import type { FinancialDoc, FinancialDocType, FinancialInstallmentLabel } from "@/features/hubos/assets";

const DEFAULT_FINANCIAL_DOC_TYPE: FinancialDocType = "PAYMENT_PROOF";
const DEFAULT_INSTALLMENT_LABEL: FinancialInstallmentLabel = '1/1';
const OS_DRAFT_STORAGE_KEY = 'hubos:create-os-draft';

interface CreateOSDialogProps {
  onCreated: (order: OsOrder) => void;
}

export default function CreateOSDialog({ onCreated }: CreateOSDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmDraftDialogOpen, setConfirmDraftDialogOpen] = useState(false);
  const [saleNumber, setSaleNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [logisticType, setLogisticType] = useState<LogisticType>("retirada");
  const [address, setAddress] = useState("");
  const [selectedArtDirectionTag, setSelectedArtDirectionTag] =
    useState<ArtDirectionTag | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [financialDocs, setFinancialDocs] = useState<FinancialDoc[]>([]);
  const [uploadingAssets, setUploadingAssets] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<OsOrder | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const financialDocInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const reproducao = false;
  const letraCaixa = false;

  const saveDraft = () => {
    try {
      const payload = {
        saleNumber,
        clientName,
        description,
        deliveryDate,
        logisticType,
        address,
        selectedArtDirectionTag,
      };
      localStorage.setItem(OS_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.error('Erro ao salvar rascunho local da OS.', error);
    }
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(OS_DRAFT_STORAGE_KEY);
    } catch (error) {
      console.error('Erro ao limpar rascunho local da OS.', error);
    }
  };

  const reset = () => {
    setSaleNumber("");
    setClientName("");
    setDescription("");
    setDeliveryDate("");
    setLogisticType("retirada");
    setAddress("");
    setSelectedArtDirectionTag(null);
    setSelectedFiles([]);
    setFinancialDocs([]);
    setPendingOrder(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (financialDocInputRef.current) {
      financialDocInputRef.current.value = "";
    }
  };

  const closeDialogAfterConfirmation = () => {
    setConfirmDraftDialogOpen(false);
    setOpen(false);
    reset();
  };

  const confirmSaveDraftAndCreateCard = async () => {
    const draftHasAnyData =
      Boolean(saleNumber.trim()) ||
      Boolean(clientName.trim()) ||
      Boolean(description.trim()) ||
      Boolean(deliveryDate) ||
      logisticType !== "retirada" ||
      Boolean(address.trim()) ||
      Boolean(selectedArtDirectionTag) ||
      selectedFiles.length > 0 ||
      financialDocs.length > 0;

    if (!draftHasAnyData) {
      setConfirmDraftDialogOpen(false);
      setOpen(false);
      reset();
      toast.message("Nenhum dado para salvar como rascunho.");
      return;
    }

    try {
      setSaving(true);

      const order = await createOrder({
        sale_number: saleNumber.trim() || "Rascunho",
        client_name: clientName.trim() || "Rascunho",
        title: "Rascunho",
        description: description.trim() || "Rascunho",
        delivery_date: deliveryDate || null,
        logistic_type: logisticType,
        address: logisticType === "retirada" ? null : address || null,
        art_status: ART_COLUMNS[0],
        prod_status: null,
        art_direction_tag: selectedArtDirectionTag,
        reproducao,
        letra_caixa: letraCaixa,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      });

      onCreated(order);
      saveDraft();
      setConfirmDraftDialogOpen(false);
      setOpen(false);
      reset();
      toast.success("Rascunho salvo na Caixa de Entrada.");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível salvar o rascunho.");
    } finally {
      setSaving(false);
    }
  };

  const hasDraftableData =
    Boolean(saleNumber.trim()) ||
    Boolean(clientName.trim()) ||
    Boolean(description.trim()) ||
    Boolean(deliveryDate) ||
    logisticType !== "retirada" ||
    Boolean(address.trim()) ||
    Boolean(selectedArtDirectionTag) ||
    selectedFiles.length > 0 ||
    financialDocs.length > 0;

  const handleSaveAsDraft = async () => {
    if (!hasDraftableData) {
      setConfirmDraftDialogOpen(false);
      setOpen(false);
      reset();
      toast.message("Nenhum dado para salvar como rascunho.");
      return;
    }

    try {
      setSaving(true);

      const order = await createOrder({
        sale_number: saleNumber.trim() || "Rascunho",
        client_name: clientName.trim() || "Rascunho",
        title: "Rascunho",
        description: description.trim() || "Rascunho",
        delivery_date: deliveryDate || null,
        logistic_type: logisticType,
        address: logisticType === "retirada" ? null : address || null,
        art_status: ART_COLUMNS[0],
        prod_status: null,
        art_direction_tag: selectedArtDirectionTag,
        reproducao,
        letra_caixa: letraCaixa,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      });

      onCreated(order);
      saveDraft();
      setConfirmDraftDialogOpen(false);
      setOpen(false);
      reset();
      toast.success("Rascunho salvo na Caixa de Entrada.");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível salvar o rascunho.");
    } finally {
      setSaving(false);
    }
  };

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const handleAssetChange = (files: FileList | null) => {
    if (!files) return;
    const nextFiles = [...selectedFiles, ...Array.from(files)];
    const validation = validateFiles(nextFiles);
    if (!validation.ok) {
      toast.error(validation.error ?? "Arquivos inválidos.");
      return;
    }
    setSelectedFiles(nextFiles);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAssetFile = (index: number) => {
    setSelectedFiles(current =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const handleFinancialDocChange = (files: FileList | null) => {
    if (!files) return;
    const nextFiles = [
      ...financialDocs.map(doc => doc.file),
      ...Array.from(files),
    ];
    const validation = validateFiles(nextFiles);
    if (!validation.ok) {
      toast.error(validation.error ?? "Arquivos inválidos.");
      return;
    }
    setFinancialDocs(current => [
      ...current,
      ...Array.from(files).map(file => ({
        file,
        type: DEFAULT_FINANCIAL_DOC_TYPE,
        installmentLabel: DEFAULT_INSTALLMENT_LABEL,
        secondDueDate: null,
      })),
    ]);
    if (financialDocInputRef.current) {
      financialDocInputRef.current.value = "";
    }
  };

  const removeFinancialDoc = (index: number) => {
    setFinancialDocs(current =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const updateFinancialDocType = (index: number, newType: FinancialDocType) => {
    setFinancialDocs(current =>
      current.map((doc, itemIndex) =>
        itemIndex === index
          ? {
              ...doc,
              type: newType,
              installmentLabel:
                newType === 'PAYMENT_PROOF' ? doc.installmentLabel ?? DEFAULT_INSTALLMENT_LABEL : undefined,
              secondDueDate: newType === 'PAYMENT_PROOF' ? doc.secondDueDate ?? null : undefined,
            }
          : doc
      )
    );
  };

  const updateInstallmentLabel = (index: number, installmentLabel: FinancialInstallmentLabel) => {
    setFinancialDocs((current) =>
      current.map((doc, itemIndex) =>
        itemIndex === index
          ? {
              ...doc,
              installmentLabel,
              secondDueDate: installmentLabel === '1/2' ? doc.secondDueDate ?? '' : null,
            }
          : doc
      )
    );
  };

  const updateSecondDueDate = (index: number, secondDueDate: string) => {
    setFinancialDocs((current) =>
      current.map((doc, itemIndex) => (itemIndex === index ? { ...doc, secondDueDate } : doc))
    );
  };

  const financialTypeLabels: Record<FinancialDocType, string> = {
    PAYMENT_PROOF: "Comprovante",
    PURCHASE_ORDER: "Ordem de compra",
  };

  const applyWrap = (prefix: string, suffix = prefix) => {
    const textarea = descriptionRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const before = description.slice(0, start);
    const selection = description.slice(start, end);
    const after = description.slice(end);
    const nextValue = `${before}${prefix}${selection}${suffix}${after}`;
    setDescription(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursorStart = start + prefix.length;
      const cursorEnd = cursorStart + selection.length;
      textarea.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  const applyLinePrefix = (prefix: string) => {
    const textarea = descriptionRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const value = description;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEndIndex = value.indexOf("\n", end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const block = value.slice(lineStart, lineEnd);
    const nextBlock = block
      .split("\n")
      .map(line => (line.trim() ? `${prefix}${line}` : line))
      .join("\n");
    const nextValue = `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`;
    setDescription(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart, lineStart + nextBlock.length);
    });
  };

  const handleSubmit = async () => {
    const assetValidation = validateFiles(selectedFiles);
    if (!assetValidation.ok) {
      toast.error(assetValidation.error ?? "Arquivos inválidos.");
      return;
    }
    const financialValidation = validateFiles(
      financialDocs.map(doc => doc.file)
    );
    if (!financialValidation.ok) {
      toast.error(
        financialValidation.error ?? "Documentos financeiros inválidos."
      );
      return;
    }

    const invalidProofDoc = financialDocs.find(
      (doc) => doc.type === 'PAYMENT_PROOF' && doc.installmentLabel === '1/2' && !doc.secondDueDate
    );
    if (invalidProofDoc) {
      toast.error('Para comprovante 1/2, a Data 2ª Parcela é obrigatória.');
      return;
    }

    if (pendingOrder) {
      if (selectedFiles.length === 0 && financialDocs.length === 0) {
        toast.error("Selecione ao menos um arquivo para reenviar.");
        return;
      }

      try {
        if (selectedFiles.length > 0) {
          setUploadingAssets(true);
          await uploadAssetsForOrder({
            osId: pendingOrder.id,
            files: selectedFiles,
            userId: user?.id ?? null,
          });
          toast.success("Arquivos enviados e aguardando sincronização.");
        }
        if (financialDocs.length > 0) {
          setUploadingAssets(true);
          await uploadFinancialDocsForOrder({
            orderId: pendingOrder.id,
            docs: financialDocs,
            userId: user?.id ?? null,
          });
          toast.success(
            "Documentos financeiros enviados e aguardando sincronização."
          );
        }
        clearDraft();
        reset();
        setOpen(false);
      } catch (uploadError) {
        console.error(uploadError);
        toast.error(
          uploadError instanceof Error
            ? uploadError.message
            : "Falha ao reenviar os arquivos. Tente novamente."
        );
      } finally {
        setUploadingAssets(false);
      }
      return;
    }

    if (!saleNumber || !clientName || !description || !deliveryDate) {
      toast.error("Preencha os campos obrigatórios.");
      return;
    }
    if (!selectedArtDirectionTag) {
      toast.error("Selecione a tag de direcionamento de arte.");
      return;
    }

    try {
      setSaving(true);
      const order = await createOrder({
        sale_number: saleNumber,
        client_name: clientName,
        description,
        delivery_date: deliveryDate,
        logistic_type: logisticType,
        address: logisticType === "retirada" ? null : address || null,
        art_status: ART_COLUMNS[0],
        prod_status: null,
        art_direction_tag: selectedArtDirectionTag,
        reproducao,
        letra_caixa: letraCaixa,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      });
      onCreated(order);
      toast.success("Ordem criada com sucesso.");

      if (selectedFiles.length > 0) {
        try {
          setUploadingAssets(true);
          await uploadAssetsForOrder({
            osId: order.id,
            files: selectedFiles,
            userId: user?.id ?? null,
          });
          toast.success("Arquivos enviados e aguardando sincronização.");
        } catch (uploadError) {
          console.error(uploadError);
          toast.error(
            uploadError instanceof Error
              ? uploadError.message
              : "OS criada, mas o envio dos arquivos falhou. Reenvie os arquivos."
          );
          setPendingOrder(order);
          setFinancialDocs([]);
          if (financialDocInputRef.current) {
            financialDocInputRef.current.value = "";
          }
          return;
        } finally {
          setUploadingAssets(false);
        }
      }
      if (financialDocs.length > 0) {
        try {
          setUploadingAssets(true);
          await uploadFinancialDocsForOrder({
            orderId: order.id,
            docs: financialDocs,
            userId: user?.id ?? null,
          });
          toast.success(
            "Documentos financeiros enviados e aguardando sincronização."
          );
        } catch (financialError) {
          console.error(financialError);
          toast.error(
            financialError instanceof Error
              ? financialError.message
              : "OS criada, mas houve erro ao enviar documentos financeiros."
          );
        } finally {
          setUploadingAssets(false);
        }
      }
      clearDraft();
      reset();
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao criar ordem de serviço.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (!nextOpen && confirmDraftDialogOpen) {
          return;
        }

        setOpen(nextOpen);
        if (!nextOpen) {
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>Gerar Ordem de Serviço</Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100vh-2rem)] w-[95vw] overflow-y-auto sm:max-w-4xl lg:max-w-5xl"
        onInteractOutside={event => {
          event.preventDefault();
          setConfirmDraftDialogOpen(true);
        }}
      >
        <DialogHeader>
          <DialogTitle>Nova Ordem de Serviço</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Nº da venda</Label>
                  <Input
                    value={saleNumber}
                    onChange={event => setSaleNumber(event.target.value)}
                    disabled={Boolean(pendingOrder)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cliente</Label>
                  <Input
                    value={clientName}
                    onChange={event => setClientName(event.target.value)}
                    disabled={Boolean(pendingOrder)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Data de entrega</Label>
                  <Input
                    type="date"
                    value={deliveryDate}
                    onChange={event => setDeliveryDate(event.target.value)}
                    disabled={Boolean(pendingOrder)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Tipo de logística</Label>
                  <RadioGroup
                    value={logisticType}
                    onValueChange={value =>
                      setLogisticType(value as LogisticType)
                    }
                    disabled={Boolean(pendingOrder)}
                  >
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value="retirada" />
                        Retirada
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value="entrega" />
                        Entrega
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value="instalacao" />
                        Instalação
                      </label>
                    </div>
                  </RadioGroup>
                </div>
              </div>

              {logisticType !== "retirada" && (
                <div className="space-y-1">
                  <Label>Endereço (opcional)</Label>
                  <Input
                    value={address}
                    onChange={event => setAddress(event.target.value)}
                    disabled={Boolean(pendingOrder)}
                  />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Descrição</Label>
                <div className="rounded-md border border-input bg-background">
                  <div className="flex flex-wrap items-center gap-1 border-b border-input px-2 py-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => applyWrap("**")}
                      disabled={Boolean(pendingOrder)}
                      aria-label="Aplicar negrito"
                    >
                      <Bold className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => applyWrap("*")}
                      disabled={Boolean(pendingOrder)}
                      aria-label="Aplicar itálico"
                    >
                      <Italic className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => applyWrap("__")}
                      disabled={Boolean(pendingOrder)}
                      aria-label="Aplicar sublinhado"
                    >
                      <Underline className="h-4 w-4" />
                    </Button>
                    <div className="h-5 w-px bg-border" aria-hidden="true" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => applyLinePrefix("- ")}
                      disabled={Boolean(pendingOrder)}
                      aria-label="Aplicar lista com marcadores"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => applyLinePrefix("1. ")}
                      disabled={Boolean(pendingOrder)}
                      aria-label="Aplicar lista numerada"
                    >
                      <ListOrdered className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    ref={descriptionRef}
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    rows={4}
                    placeholder={`Descrição detalhada do pedido:
Material:
Orientações para a criação de arte:`}
                    disabled={Boolean(pendingOrder)}
                    className="min-h-[120px] rounded-none border-0 shadow-none focus-visible:border-transparent focus-visible:ring-0"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tag de direcionamento</Label>
                <div className="flex flex-wrap gap-2">
                  {ART_DIRECTION_TAGS.map(tag => {
                    const config = ART_DIRECTION_TAG_CONFIG[tag];
                    const isSelected = selectedArtDirectionTag === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setSelectedArtDirectionTag(tag);
                          if (tag === "URGENTE") {
                            toast.warning(
                              "Use essa tag para pedidos que são realmente urgentes. Ex: Pedido para o dia seguinte."
                            );
                          }
                        }}
                        disabled={Boolean(pendingOrder)}
                        className="rounded-full border px-3 py-1 text-xs font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        style={{
                          borderColor: config.color,
                          backgroundColor: isSelected
                            ? config.color
                            : "transparent",
                          color: isSelected ? "#FFFFFF" : config.color,
                        }}
                      >
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Anexos (opcional)</Label>
              <p className="text-xs text-muted-foreground">
                Anexe arquivos de arte, referências e documentos financeiros
                relacionados à OS.
              </p>
            </div>
            <Accordion type="multiple" className="space-y-2">
              <AccordionItem
                value="art-assets"
                className="rounded-lg border border-muted px-4"
              >
                <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                  <span>
                    Arte e referências ({selectedFiles.length} arquivo
                    {selectedFiles.length === 1 ? "" : "s"})
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  <div className="space-y-2">
                    <Label
                      htmlFor="os-assets"
                      className="text-xs text-muted-foreground"
                    >
                      Arquivos de arte e referências
                    </Label>
                    <Input
                      ref={fileInputRef}
                      id="os-assets"
                      type="file"
                      multiple
                      accept={ACCEPTED_ASSET_CONTENT_TYPES.join(",")}
                      disabled={uploadingAssets || Boolean(pendingOrder)}
                      onChange={event => handleAssetChange(event.target.files)}
                      className="sr-only"
                    />
                    <label
                      htmlFor="os-assets"
                      className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
                    >
                      <UploadCloud className="h-6 w-6" />
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          Clique para adicionar arquivos
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedFiles.length > 0
                            ? `${selectedFiles.length} arquivo(s) selecionado(s).`
                            : "Arraste e solte ou selecione no seu computador."}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Máximo de{" "}
                        {Math.round(MAX_ASSET_FILE_SIZE_BYTES / 1024 / 1024)}MB
                        por arquivo.
                      </p>
                    </label>
                    {selectedFiles.length > 0 && (
                      <ul className="space-y-2 rounded-md border border-muted p-3 text-sm">
                        {selectedFiles.map((file, index) => (
                          <li
                            key={`${file.name}-${file.lastModified}`}
                            className="flex items-center justify-between gap-3"
                          >
                            <div>
                              <p className="font-medium">{file.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(file.size)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeAssetFile(index)}
                              disabled={uploadingAssets}
                            >
                              Remover
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {pendingOrder && (
                      <p className="text-xs text-amber-600">
                        A OS foi criada. Reenvie os arquivos para concluir a
                        sincronização.
                      </p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem
                value="financial-docs"
                className="rounded-lg border border-muted px-4"
              >
                <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                  <span>
                    Documentos financeiros ({financialDocs.length} arquivo
                    {financialDocs.length === 1 ? "" : "s"})
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Selecione comprovantes e ordens de compra para acompanhar
                      a OS.
                    </p>
                    <div className="space-y-1">
                      <Label htmlFor="financial-docs">
                        Anexar documento(s)
                      </Label>
                      <Input
                        ref={financialDocInputRef}
                        id="financial-docs"
                        type="file"
                        multiple
                        accept={ACCEPTED_ASSET_CONTENT_TYPES.join(",")}
                        disabled={uploadingAssets || Boolean(pendingOrder)}
                        onChange={event =>
                          handleFinancialDocChange(event.target.files)
                        }
                        className="sr-only"
                      />
                      <label
                        htmlFor="financial-docs"
                        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
                      >
                        <UploadCloud className="h-6 w-6" />
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">
                            Clique para adicionar documentos
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {financialDocs.length > 0
                              ? `${financialDocs.length} arquivo(s) anexado(s).`
                              : "Arraste e solte ou selecione no seu computador."}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Máximo de{" "}
                          {Math.round(MAX_ASSET_FILE_SIZE_BYTES / 1024 / 1024)}
                          MB por arquivo.
                        </p>
                      </label>
                    </div>
                    {financialDocs.length > 0 && (
                      <ul className="space-y-2 rounded-md border border-muted p-3 text-sm">
                        {financialDocs.map((doc, index) => (
                          <li
                            key={`${doc.file.name}-${doc.file.lastModified}`}
                            className="flex flex-wrap items-center gap-3"
                          >
                            <div className="min-w-[200px] flex-1">
                              <p className="font-medium">{doc.file.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(doc.file.size)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">
                                {financialTypeLabels[doc.type]}
                              </Badge>
                              <Select
                                value={doc.type}
                                onValueChange={value =>
                                  updateFinancialDocType(
                                    index,
                                    value as FinancialDocType
                                  )
                                }
                                disabled={
                                  uploadingAssets || Boolean(pendingOrder)
                                }
                              >
                                <SelectTrigger className="h-8 w-[180px] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="PAYMENT_PROOF">
                                    Comprovante
                                  </SelectItem>
                                  <SelectItem value="PURCHASE_ORDER">
                                    Ordem de compra
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              {doc.type === 'PAYMENT_PROOF' && (
                                <>
                                  <Select
                                    value={doc.installmentLabel ?? DEFAULT_INSTALLMENT_LABEL}
                                    onValueChange={(value) =>
                                      updateInstallmentLabel(index, value as FinancialInstallmentLabel)
                                    }
                                    disabled={uploadingAssets || Boolean(pendingOrder)}
                                  >
                                    <SelectTrigger className="h-8 w-[90px] text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="1/1">1/1</SelectItem>
                                      <SelectItem value="1/2">1/2</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {(doc.installmentLabel ?? DEFAULT_INSTALLMENT_LABEL) === '1/2' && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-foreground">Data 2ª Parcela:</span>
                                      <Input
                                        type="date"
                                        className="h-8 w-[170px] text-xs"
                                        value={doc.secondDueDate ?? ''}
                                        onChange={(event) => updateSecondDueDate(index, event.target.value)}
                                        disabled={uploadingAssets || Boolean(pendingOrder)}
                                      />
                                    </div>
                                  )}
                                </>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeFinancialDoc(index)}
                                disabled={
                                  uploadingAssets || Boolean(pendingOrder)
                                }
                              >
                                Remover
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
        <div className="sticky bottom-0 border-t bg-background pt-4">
          <Button onClick={handleSubmit} disabled={saving || uploadingAssets}>
            {pendingOrder ? "Enviar arquivos" : "Gerar Ordem de Serviço"}
          </Button>
        </div>
      </DialogContent>

      <AlertDialog
        open={confirmDraftDialogOpen}
        onOpenChange={setConfirmDraftDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja fechar?</AlertDialogTitle>
            <AlertDialogDescription>
              Para evitar perda acidental de informações, confirme se deseja
              fechar a tela de Nova Ordem de Serviço.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={closeDialogAfterConfirmation}>
              Fechar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
