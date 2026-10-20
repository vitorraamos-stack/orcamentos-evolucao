import { describe, expect, it } from "vitest";
import type { OfficialEstimatePublicResult, EstimatorFormProduct } from "@shared/estimator";
import { addDecimal, compareDecimal, decimalString } from "@shared/calculation-engine/decimal";
import { buildContaAzulTransfer } from "./contaAzulTransfer";

const productId="10000000-0000-4000-8000-000000000001";
const versionId="10000000-0000-4000-8000-000000000002";
const product={
  productId, productVersionId:versionId, productVersionNumber:3,
  name:"Letreiro em PVC Expandido",
} as EstimatorFormProduct;

function result(options: {
  productAmount?: string;
  installation?: string | null;
  munck?: string | null;
  subtotal?: string;
  total?: string;
  productVersionId?: string;
  productVersionNumber?: number;
}={}): OfficialEstimatePublicResult {
  const p=options.productAmount??"700";
  const install=options.installation??"0";
  const munck=options.munck??"0";
  const subtotal=options.subtotal??String(Number(p)+Number(install)+Number(munck));
  return {
    productId,productVersionId:options.productVersionId??versionId,
    productVersionNumber:options.productVersionNumber??3,
    commercialQuantity:"2",installments:4,
    productSellingPrice:{amount:p},
    installation:{
      requested:options.installation!==undefined&&options.installation!==null,
      price:{amount:install},
    },
    munck:{
      requested:options.munck!==undefined&&options.munck!==null,
      price:{amount:munck},
      billedHours:options.munck===undefined||options.munck===null?null:"4",
    },
    subtotalBeforeFinancialRate:{amount:subtotal},
    totalSellingPrice:{amount:options.total??subtotal},
  } as OfficialEstimatePublicResult;
}
const details=["Largura: 150 cm","Altura: 50 cm","Espessura: 10 mm"];
describe("PR 31G — transferência assistida e conferência Conta Azul",()=>{
  it("copies one product line with explicit quantity and TOTAL line amount",()=>{
    const out=buildContaAzulTransfer(result(),product,details);
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]).toMatchObject({
      id:"product",quantity:"2",lineTotal:"700",
    });
    expect(out.lines[0].description).toContain("Espessura: 10 mm");
    expect(out.copyText).toContain("Valor TOTAL da linha (não unitário)");
    expect(out.copyText).toContain("TOTAL OFICIAL CALCULADO");
    expect(out.copyText).toContain("cadastro manual");
    expect(out.copyText).not.toContain("Custo interno");
  });

  it("does not double-charge installation or munck and keeps them as separate lines",()=>{
    const out=buildContaAzulTransfer(result({
      installation:"120",munck:"200",subtotal:"1020",total:"1020",
    }),product,details);
    expect(out.lines.map(x=>x.id)).toEqual(["product","installation","munck"]);
    expect(out.lines.map(x=>x.lineTotal)).toEqual(["700","120","200"]);
    expect(out.lines[1].description).toContain("Instalação");
    expect(out.lines[2].description).toContain("4h");
    expect(out.finalTotal).toBe("1020");
  });

  it("creates a transparent financial adjustment and reconciles to the cent",()=>{
    const out=buildContaAzulTransfer(result({
      installation:"120",munck:"200",subtotal:"1020",total:"1095.55",
    }),product,details);
    expect(out.lines.at(-1)).toMatchObject({
      id:"adjustment",quantity:"1",lineTotal:"75.55",
    });
    const sum=out.lines.reduce((x,y)=>addDecimal(x,y.lineTotal),decimalString("0"));
    expect(compareDecimal(sum,out.finalTotal)).toBe(0);
    expect(out.copyText).toContain("Ajuste da condição de pagamento");
    expect(out.copyText).toContain("1.095,55");
    expect(out.installments).toBe(4);
  });

  it("exposes negative rounding adjustments rather than altering line values",()=>{
    const out=buildContaAzulTransfer(result({
      productAmount:"100.004",installation:"20.005",
      subtotal:"120.009",total:"120.00",
    }),product,[]);
    expect(out.lines.map(x=>x.lineTotal)).toEqual(["100","20.01","-0.01"]);
    expect(out.lines.at(-1)?.id).toBe("adjustment");
    expect(compareDecimal(out.lines.reduce((sum,x)=>addDecimal(sum,x.lineTotal),
      decimalString("0")),out.finalTotal)).toBe(0);
  });

  it("rejects a fabricated subtotal and does not generate copyable content",()=>{
    expect(()=>buildContaAzulTransfer(result({
      installation:"120",subtotal:"700",total:"900",
    }),product,details)).toThrow("não conferem");
  });

  it("rejects changed product IDs, engineering versions and negative totals",()=>{
    expect(()=>buildContaAzulTransfer(result({
      productVersionId:"10000000-0000-4000-8000-000000000003",
    }),product,details)).toThrow("versão calculada");
    expect(()=>buildContaAzulTransfer(result({
      productVersionNumber:4,
    }),product,details)).toThrow("versão calculada");
    expect(()=>buildContaAzulTransfer(result({
      total:"-1",
    }),product,details)).toThrow("não pode ser negativo");
  });

  it("never invents prices per unit even for commercialQuantity greater than one",()=>{
    const out=buildContaAzulTransfer(result(),product,[]);
    expect(out.lines[0].quantity).toBe("2");
    expect(out.lines[0].lineTotal).toBe("700");
    expect(out.copyText).toContain("não unitário");
    expect(out.copyText).toContain("total final antes de salvar");
  });
});
