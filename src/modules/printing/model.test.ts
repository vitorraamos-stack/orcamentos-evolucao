import { describe,expect,it } from "vitest";
import { decimal,estimatePrint } from "./model";
const roll={width_cm:137,remaining_length_m:3};
describe("consumo de impressão",()=>{
 it("calcula avanço individual sem cobrar largura de bobina como metragem",()=>{
  expect(estimatePrint(roll,100,200,1)).toBe(2);
 });
 it("inclui quantidade e perda adicional em centímetros",()=>{
  expect(estimatePrint({width_cm:137,remaining_length_m:10},100,200,2,15)).toBe(4.15);
 });
 it("bloqueia impressão mais larga que a bobina",()=>{
  expect(()=>estimatePrint(roll,150,100,1)).toThrow(/largura/);
 });
 it("não permite saldo negativo, quantidade fracionada ou dimensões inválidas",()=>{
  expect(()=>estimatePrint(roll,100,200,2)).toThrow(/metragem/);
  expect(()=>estimatePrint(roll,100,200,1.5)).toThrow(/válidas/);
  expect(()=>estimatePrint(roll,-10,200,1)).toThrow(/válidas/);
 });
 it("aceita vírgula decimal",()=>{expect(decimal("1,37")).toBe(1.37)});
});
