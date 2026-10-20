import { z } from "zod";
import type { EstimatorFormDefinition } from "@shared/estimator";
import {
  normalizeUserDecimal,
  initialEstimatorFields,
  type EstimatorFieldUnits,
  type EstimatorFieldValues,
} from "./estimatorForm";
import { convertUnit } from "@shared/calculation-engine/units";
import type { CommercialEstimatorCheck } from "../library/commercial/estimatorRepository";

const schema = z.object({
  actorId: z.string().uuid(),
  productId: z.string().uuid(),
  libraryProductId: z.string().uuid(),
  productVersionId: z.string().uuid(),
  commercialVersion: z.number().int().positive(),
  width: z.string(),
  height: z.string(),
  dimensionsUnit: z.enum(["mm", "cm", "m"]),
  thickness: z.string(),
  quantity: z.string(),
}).strict();
type CommercialHandoff = z.infer<typeof schema>;
let pending: CommercialHandoff | null = null;

export function clearCommercialHandoff(): void { pending = null; }

/** No URL query data or browser persistence; transport is one-time SPA memory only. */
export function stageCommercialHandoff(
  actorId: string,
  check: CommercialEstimatorCheck,
  values: Record<string, unknown>,
  selectedComplementIds: string[]
): void {
  pending=null;
  const {adapter,eligibility}=check;
  if(eligibility.status!=="CALCULABLE"||!eligibility.canAttemptCalculation||
     eligibility.canTransfer||!adapter.engineeringVersion ||
     eligibility.engineeringVersion?.id!==adapter.engineeringVersion.id ||
     selectedComplementIds.length ||
     values.acabamento!=="PVC natural branco"||
     values.instalacao!=="Não"||values.arte_vetorial!=="Sim")
    throw new Error("A configuração ainda não pode seguir para o cálculo oficial.");
  const dims=values.medidas;
  if(!dims||typeof dims!=="object"||Array.isArray(dims))
    throw new Error("Informe as medidas do produto.");
  const measurement=dims as Record<string, unknown>;
  const commercialUnit=adapter.fields.find(f=>f.id==="medidas")?.unit;
  const input=schema.parse({
    actorId,productId:adapter.productId,libraryProductId:adapter.libraryProductId,
    productVersionId:adapter.engineeringVersion.id,
    commercialVersion:adapter.commercialVersion,
    width:String(measurement.width??""),height:String(measurement.height??""),
    dimensionsUnit:commercialUnit,thickness:values.espessura,
    quantity:String(values.quantidade??""),
  });
  const width=Number(normalizeUserDecimal(input.width));
  const height=Number(normalizeUserDecimal(input.height));
  const quantity=Number(normalizeUserDecimal(input.quantity));
  if(!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0||
     !Number.isSafeInteger(quantity)||quantity<=0)
    throw new Error("Dimensões ou quantidade inválidas para o Orçamentista.");
  pending=input;
}

export type EstimatorPrefill = {
  productVersionId: string;
  values: EstimatorFieldValues;
  units: EstimatorFieldUnits;
  quantity: string;
};

/**
 * Revalidates form product ID, version, field presence and thickness option
 * against the official form; never issues an official calculation.
 */
export function consumeCommercialHandoff(
  actorId: string | undefined,
  definition: EstimatorFormDefinition
): { prefill: EstimatorPrefill | null; attempted: boolean } {
  const staged=pending;
  pending=null;
  if(!staged)return {prefill:null,attempted:false};
  if(!actorId||staged.actorId!==actorId)return {prefill:null,attempted:true};
  const product=definition.products.find(p=>
    p.productId===staged.productId &&
    p.productVersionId===staged.productVersionId && p.calculationAvailable
  );
  if(!product)return {prefill:null,attempted:true};
  const width=product.inputs.find(i=>i.key==="width");
  const height=product.inputs.find(i=>i.key==="height");
  const thickness=product.inputs.find(i=>i.key==="thickness");
  if(!width||!height||!thickness||width.type!=="DECIMAL"||
     height.type!=="DECIMAL"||thickness.type!=="SELECT")
    return {prefill:null,attempted:true};
  const option=thickness.options.find(o=>o.label===staged.thickness);
  if(!option)return {prefill:null,attempted:true};
  try{
    const initial=initialEstimatorFields(product.inputs);
    const widthUnit=initial.units.width;
    const heightUnit=initial.units.height;
    if(!widthUnit||!heightUnit)return {prefill:null,attempted:true};
    const vwidth=convertUnit(normalizeUserDecimal(staged.width),staged.dimensionsUnit,widthUnit);
    const vheight=convertUnit(normalizeUserDecimal(staged.height),staged.dimensionsUnit,heightUnit);
    return {attempted:true,prefill:{
      productVersionId:product.productVersionId,
      values:{...initial.values,width:vwidth,height:vheight,thickness:option.value},
      units:initial.units,
      quantity:normalizeUserDecimal(staged.quantity),
    }};
  }catch{
    return {prefill:null,attempted:true};
  }
}
