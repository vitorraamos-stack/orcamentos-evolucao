import { supabase } from "@/lib/supabase";
import type { PrintRoll,InkBalance,StockEvent } from "./model";

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};
export async function loadPrintStock() {
  const [r,i,e] = await Promise.all([
    supabase.from("print_inventory_rolls")
      .select("id,code,material,width_cm,initial_length_m,remaining_length_m,created_at")
      .order("created_at",{ascending:false}),
    supabase.from("print_inventory_inks").select("color,balance_ml").order("color"),
    supabase.from("print_inventory_events")
      .select("id,kind,roll_id,color,delta_m,delta_ml,os_ref,reason,created_at")
      .order("created_at",{ascending:false}).limit(30),
  ]);
  fail(r.error); fail(i.error); fail(e.error);
  return {
    rolls:(r.data??[]) as PrintRoll[],
    inks:(i.data??[]) as InkBalance[],
    events:(e.data??[]) as StockEvent[],
  };
}
export async function addPrintRoll(input:{requestId:string;material:string;widthCm:number;lengthM:number}) {
  const {error}=await supabase.rpc("print_inventory_add_roll",{
    p_request_id:input.requestId,p_material:input.material,
    p_width_cm:input.widthCm,p_length_m:input.lengthM,
  });
  fail(error);
}
export async function recordPrint(input:{
  requestId:string;rollId:string;osRef:string;widthCm:number;lengthCm:number;
  copies:number;wasteCm:number;reprint:boolean;reason:string;
}) {
  const {error}=await supabase.rpc("print_inventory_record_print",{
    p_request_id:input.requestId,p_roll_id:input.rollId,p_os_ref:input.osRef,
    p_width_cm:input.widthCm,p_length_cm:input.lengthCm,
    p_copies:input.copies,p_waste_cm:input.wasteCm,
    p_reprint:input.reprint,p_reason:input.reason||null,
  });
  fail(error);
}
export async function adjustPrintRoll(input:{
  requestId:string;rollId:string;newLengthM:number;reason:string;
}) {
  const {error}=await supabase.rpc("print_inventory_adjust_roll",{
    p_request_id:input.requestId,p_roll_id:input.rollId,
    p_new_length_m:input.newLengthM,p_reason:input.reason,
  });
  fail(error);
}
export async function movePrintInk(input:{
  requestId:string;color:string;quantityMl:number;entry:boolean;
}) {
  const {error}=await supabase.rpc("print_inventory_move_ink",{
    p_request_id:input.requestId,p_color:input.color,
    p_quantity_ml:input.quantityMl,p_entry:input.entry,
  });
  fail(error);
}
