import { describe, expect, it } from "vitest";
import { OPERATION_STATUS_LABELS, WORK_CENTER_LABELS, operationSummary, type ItemOperation } from "./operations";
const operation=(status:ItemOperation["status"],work_center:ItemOperation["work_center"],is_required=true)=>({status,work_center,is_required});
describe("production operations domain",()=>{
 it("centralizes canonical labels including electrical lighting",()=>{expect(WORK_CENTER_LABELS.ELECTRICAL_LIGHTING).toBe("Elétrica / Iluminação");expect(OPERATION_STATUS_LABELS.BLOCKED).toBe("Bloqueado")});
 it("calculates required progress, active centers and blockers",()=>{const result=operationSummary([operation("COMPLETED","PRINTING"),operation("COMPLETED","METALWORK"),operation("COMPLETED","ASSEMBLY"),operation("IN_PROGRESS","ELECTRICAL_LIGHTING"),operation("BLOCKED","FINISHING_QC")]);expect(result).toEqual({total:5,completed:3,blocked:1,activeWorkCenters:["ELECTRICAL_LIGHTING","FINISHING_QC"]})});
 it("does not count optional work against progress",()=>{expect(operationSummary([operation("COMPLETED","PRINTING"),operation("PENDING","FINISHING_QC",false)])).toMatchObject({total:1,completed:1})});
});
