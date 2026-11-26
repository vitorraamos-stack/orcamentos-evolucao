import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Circle, Copy, Plus, Trash2 } from "lucide-react";
import { ART_DIRECTION_TAG_CONFIG } from "@/features/hubos/artDirectionTagConfig";
import { ART_DIRECTION_CHOICES } from "@/features/hubos/orderUrgency";
import { DELIVERY_DEADLINE_PRESET_CONFIG, DELIVERY_DEADLINE_PRESETS } from "@/features/hubos/deliveryDeadlineConfig";
import {
  COMMERCIAL_BRIEFING_LOGISTICS,
  emptyCommercialBriefingItem,
  getCommercialBriefingCompletion,
  type CommercialBriefingDraft,
  type CommercialBriefingItem,
} from "./commercialBriefingDomain";
import {
  buildCommercialSummary,
  COMMERCIAL_COMPLETION_LABELS,
  COMMERCIAL_LOGISTICS_LABELS,
} from "./commercialBriefingPresentation";

const sections = [
  ["items", "Itens"],
  ["art", "Arte"],
  ["deadline", "Prazo e logística"],
  ["summary", "Resumo"],
] as const;
type Section = typeof sections[number][0];
const selectClass = "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

type PanelProps = { value: CommercialBriefingDraft } & (
  | { onChange: (next: CommercialBriefingDraft) => void; readOnly?: boolean; saved?: boolean }
  | { onChange?: never; readOnly: true; saved?: never }
);

export default function CommercialBriefingPanel({
  value, onChange, readOnly = false, saved = false,
}: PanelProps) {
  const prefix = useId();
  const [section, setSection] = useState<Section>("items");
  const [copyStatus, setCopyStatus] = useState("");
  const consultation = !onChange;
  const completion = getCommercialBriefingCompletion(value);
  const total = Object.keys(completion).length;
  const count = Object.values(completion).filter(Boolean).length;
  const summary = buildCommercialSummary(value);
  const patch = (partial: Partial<CommercialBriefingDraft>) => {
    setCopyStatus("");
    if (!readOnly) onChange?.({ ...value, ...partial });
  };
  const patchItem = (id: string, partial: Partial<CommercialBriefingItem>) =>
    patch({ items: value.items.map(item => item.id === id ? { ...item, ...partial } : item) });
  const copy = async () => {
    if (!summary || !saved) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopyStatus("Resumo copiado. Confira a mensagem antes de enviá-la.");
    } catch {
      setCopyStatus("A cópia automática não está disponível. Selecione e copie o texto manualmente.");
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{consultation ? "Preenchimento do briefing" : "Preparação da OS"}</span>
          <span className="font-semibold">{count}/{total} etapas</span>
        </div>
        <progress aria-label="Etapas preenchidas" value={count} max={total} className="block h-2 w-full accent-primary" />
        <Field label="Cliente" id={prefix + "-client"}>
          <Input id={prefix + "-client"} maxLength={250} value={value.clientName}
            disabled={readOnly} onChange={e => patch({ clientName: e.target.value })} placeholder="Nome do cliente" />
        </Field>
      </div>

      <nav aria-label="Seções do briefing" className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/30 p-1">
        {sections.map(([id, label]) => (
          <Button key={id} type="button" size="sm" variant={section === id ? "secondary" : "ghost"}
            aria-pressed={section === id} className="min-w-0 whitespace-normal" onClick={() => setSection(id)}>
            {label}
          </Button>
        ))}
      </nav>

      {section === "items" && <section aria-label="Itens e especificações" className="space-y-3">
        {value.items.length === 0 && <p className="text-sm text-muted-foreground">
          {consultation ? "Nenhum item registrado." : "Adicione os produtos ou serviços negociados."}
        </p>}
        {value.items.map((item, index) => {
          const id = prefix + "-" + item.id;
          return <article key={item.id} className="min-w-0 space-y-3 rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Item {index + 1}</h3>
              {!consultation && <Button type="button" size="icon-sm" variant="ghost" disabled={readOnly}
                aria-label={"Remover item " + (index + 1)}
                onClick={() => {
                  if (window.confirm("Remover este item do briefing?"))
                    patch({ items: value.items.filter(row => row.id !== item.id) });
                }}><Trash2 /></Button>}
            </div>
            <Field label="Produto ou serviço" id={id + "-name"}>
              <Input id={id + "-name"} maxLength={160} value={item.name} disabled={readOnly}
                onChange={e => patchItem(item.id, { name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Quantidade (un.)" id={id + "-qty"}>
                <Input id={id + "-qty"} type="number" min="0" step="any" inputMode="decimal" disabled={readOnly}
                  value={String(item.quantity)} onChange={e => patchItem(item.id, { quantity: e.target.value.slice(0, 32) })} />
              </Field>
              <Field label="Unidade de medida" id={id + "-unit"}>
                <select id={id + "-unit"} className={selectClass} disabled={readOnly} value={item.measurement_unit}
                  onChange={e => {
                    const unit = e.target.value === "m" ? "m" : "cm";
                    if (unit === item.measurement_unit) return;
                    if ((item.width_cm !== null && item.width_cm !== "") ||
                        (item.height_cm !== null && item.height_cm !== "")) {
                      if (!window.confirm("Alterar a unidade e limpar as medidas para evitar conversão incorreta?")) return;
                    }
                    patchItem(item.id, { measurement_unit: unit, width_cm: null, height_cm: null });
                  }}><option value="cm">cm</option><option value="m">m</option></select>
              </Field>
              {(["width_cm", "height_cm"] as const).map(key => (
                <Field key={key} id={id + "-" + key} label={(key === "width_cm" ? "Largura" : "Altura") + " (" + item.measurement_unit + ")"}>
                  <Input id={id + "-" + key} type="number" min="0" step="any" inputMode="decimal"
                    value={String(item[key] ?? "")} disabled={readOnly}
                    onChange={e => patchItem(item.id, { [key]: e.target.value === "" ? null : e.target.value.slice(0, 32) })} />
                </Field>
              ))}
            </div>
            <Field label="Especificações comerciais" id={id + "-description"}>
              <Textarea id={id + "-description"} maxLength={4000} rows={3} value={item.description} disabled={readOnly}
                placeholder="Material, acabamento, cores, fixação..." onChange={e => patchItem(item.id, { description: e.target.value })} />
            </Field>
            <Field label="Notas internas (não vão ao cliente)" id={id + "-notes"}>
              <Textarea id={id + "-notes"} maxLength={4000} rows={2} value={item.notes} disabled={readOnly}
                onChange={e => patchItem(item.id, { notes: e.target.value })} />
            </Field>
          </article>;
        })}
        {!consultation && <Button type="button" variant="outline" className="w-full" disabled={readOnly || value.items.length >= 100}
          onClick={() => patch({ items: [...value.items, emptyCommercialBriefingItem(crypto.randomUUID())] })}>
          <Plus /> Adicionar item
        </Button>}
      </section>}

      {section === "art" && <section aria-label="Arte" className="space-y-3">
        <Field label="Necessidade de Arte" id={prefix + "-art"}>
          <select id={prefix + "-art"} className={selectClass} disabled={readOnly} value={value.artDirectionTag ?? ""}
            onChange={e => patch({ artDirectionTag: ART_DIRECTION_CHOICES.find(choice => choice === e.target.value) ?? null })}>
            <option value="">A definir</option>
            {ART_DIRECTION_CHOICES.map(choice => <option key={choice} value={choice}>{ART_DIRECTION_TAG_CONFIG[choice].label}</option>)}
          </select>
        </Field>
        {value.artDirectionTag && <p className="text-xs text-muted-foreground">{ART_DIRECTION_TAG_CONFIG[value.artDirectionTag].text}</p>}
        <Field label="Orientações internas para Arte" id={prefix + "-instructions"}>
          <Textarea id={prefix + "-instructions"} value={value.artInstructions} maxLength={8000} rows={5}
            disabled={readOnly} onChange={e => patch({ artInstructions: e.target.value })} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={value.isUrgent} disabled={readOnly}
            onChange={e => patch({ isUrgent: e.target.checked })} />
          <span>Urgência interna <span className="block text-xs text-muted-foreground">Não altera automaticamente o prazo contratado.</span></span>
        </label>
      </section>}

      {section === "deadline" && <section aria-label="Prazo e logística" className="space-y-3">
        <fieldset disabled={readOnly} className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Prazo contratado</legend>
          {DELIVERY_DEADLINE_PRESETS.map(preset => (
            <label key={preset} className="flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm">
              <input type="radio" name={prefix + "-deadline"} className="mt-1 accent-primary" checked={value.deadlinePreset === preset}
                onChange={() => patch({ deadlinePreset: preset, deliveryDate: preset === "CUSTOM" ? value.deliveryDate : "" })} />
              <span className="min-w-0"><span className="block font-medium">{DELIVERY_DEADLINE_PRESET_CONFIG[preset].label}</span>
                <span className="block text-xs text-muted-foreground">{DELIVERY_DEADLINE_PRESET_CONFIG[preset].tooltip}</span></span>
            </label>
          ))}
          {!consultation && <Button type="button" size="sm" variant="ghost" disabled={readOnly || value.deadlinePreset === null}
            onClick={() => patch({ deadlinePreset: null, deliveryDate: "" })}>Marcar prazo a definir</Button>}
        </fieldset>
        {value.deadlinePreset === "CUSTOM" && <Field id={prefix + "-date"} label="Data acordada após consultar Produção/Gerência">
          <Input id={prefix + "-date"} type="date" disabled={readOnly} value={value.deliveryDate}
            onChange={e => patch({ deliveryDate: e.target.value })} />
        </Field>}
        <Field label="Modalidade logística" id={prefix + "-logistics"}>
          <select id={prefix + "-logistics"} className={selectClass} disabled={readOnly} value={value.logisticType ?? ""}
            onChange={e => {
              const logisticType = COMMERCIAL_BRIEFING_LOGISTICS.find(choice => choice === e.target.value) ?? null;
              patch({ logisticType, address: logisticType === "retirada" ? "" : value.address });
            }}>
            <option value="">A definir</option>
            {COMMERCIAL_BRIEFING_LOGISTICS.map(choice => <option key={choice} value={choice}>{COMMERCIAL_LOGISTICS_LABELS[choice]}</option>)}
          </select>
        </Field>
        {value.logisticType !== null && value.logisticType !== "retirada" &&
          <Field id={prefix + "-address"} label="Endereço do serviço">
            <Textarea id={prefix + "-address"} value={value.address} maxLength={2000} rows={3} disabled={readOnly}
              onChange={e => patch({ address: e.target.value })} />
          </Field>}
      </section>}

      {section === "summary" && <section aria-label="Resumo comercial" className="space-y-3">
        <Field id={prefix + "-sale"} label="Número da venda — Conta Azul">
          <Input id={prefix + "-sale"} maxLength={100} disabled={readOnly} value={value.saleNumber}
            onChange={e => patch({ saleNumber: e.target.value })} />
        </Field>
        <Field id={prefix + "-commercial-notes"} label="Observações comerciais (enviadas ao cliente)">
          <Textarea id={prefix + "-commercial-notes"} maxLength={4000} rows={3} disabled={readOnly}
            value={value.commercialNotes} onChange={e => patch({ commercialNotes: e.target.value })} />
        </Field>
        <div className="space-y-2 rounded-lg border p-3">
          <h3 className="text-sm font-semibold">Conferência de preenchimento</h3>
          {Object.entries(completion).map(([key, complete]) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              {complete ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-label="Completo" /> :
                <Circle className="size-4 shrink-0 text-muted-foreground" aria-label="Pendente" />}
              {COMMERCIAL_COMPLETION_LABELS[key as keyof typeof COMMERCIAL_COMPLETION_LABELS]}
            </div>
          ))}
        </div>
        {summary ? <div className="space-y-2">
          <Field id={prefix + "-preview"} label="Prévia para conferência do cliente">
            <Textarea id={prefix + "-preview"} readOnly value={summary} rows={10} className="text-sm" />
          </Field>
          {!consultation && <Button type="button" variant="outline" className="w-full" disabled={!saved} onClick={() => void copy()}>
            <Copy /> Copiar resumo
          </Button>}
          {!consultation && !saved && <p className="text-xs text-muted-foreground">Aguarde o salvamento antes de copiar a versão comercial.</p>}
          {copyStatus && <p role="status" className="text-xs">{copyStatus}</p>}
        </div> : <p className="rounded-lg border p-3 text-sm text-muted-foreground">
          {consultation ? "O briefing ainda está incompleto para gerar um resumo." : "Preencha cliente, itens válidos, Arte, prazo e logística para gerar o resumo."}
        </p>}
        {!consultation && <p className="text-xs text-muted-foreground">A cópia não registra aceite, não envia mensagens e não cria uma OS. A confirmação e a conversão serão habilitadas em uma etapa posterior.</p>}
      </section>}
    </div>
  );
}
