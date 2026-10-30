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


/** Read-only assisted lookup; visibility is limited by the existing os_orders RLS. */
export type PrintOrderSuggestion = { id: string; sale_number: string; client_name: string | null; title: string | null };

export async function searchPrintOrders(term: string): Promise<PrintOrderSuggestion[]> {
  const normalized = term.trim().replace(/[%_\\]/g, "").slice(0, 40);
  if (normalized.length < 2) return [];
  const { data, error } = await supabase
    .from("os_orders")
    .select("id,sale_number,client_name,title")
    .ilike("sale_number", normalized + "%")
    .order("sale_number", { ascending: false })
    .limit(6);
  fail(error);
  return (data ?? []).filter(row => Boolean(row.sale_number)) as PrintOrderSuggestion[];
}

export type PrintHistoryFilter = {
  page: number;
  pageSize: number;
  type: "all" | "prints" | "stock";
  since?: string;
  search?: string;
  rolls: PrintRoll[];
};

export async function loadPrintHistory(filters: PrintHistoryFilter): Promise<{ rows: (StockEvent & { created_by: string })[]; count: number }> {
  const { page, pageSize, type, since, rolls } = filters;
  const safe = (filters.search ?? "").trim().replace(/[^\\p{L}\\p{N}\\s-]/gu, "").slice(0, 50);
  let query = supabase
    .from("print_inventory_events")
    .select("id,kind,roll_id,color,delta_m,delta_ml,os_ref,reason,created_at,created_by", { count: "exact" });
  if (type === "prints") query = query.in("kind", ["PRINT", "REPRINT"]);
  if (type === "stock") query = query.in("kind", ["ROLL_IN", "ROLL_ADJUST", "INK_IN", "INK_USE"]);
  if (since) query = query.gte("created_at", since);
  if (safe) {
    const matchingRolls = rolls.filter(roll => (roll.code + " " + roll.material).toLocaleLowerCase("pt-BR").includes(safe.toLocaleLowerCase("pt-BR"))).map(roll => roll.id);
    const matchingColors: string[] = [];
    for (const [name, code] of [["ciano", "C"], ["magenta", "M"], ["amarelo", "Y"], ["preto", "K"]]) {
      if (name.includes(safe.toLocaleLowerCase("pt-BR"))) matchingColors.push(code);
    }
    const clauses = ["os_ref.ilike.%" + safe.replace(/\\s+/g, "%") + "%"];
    if (matchingRolls.length) clauses.push("roll_id.in.(" + matchingRolls.join(",") + ")");
    if (matchingColors.length) clauses.push("color.in.(" + matchingColors.join(",") + ")");
    query = query.or(clauses.join(","));
  }
  const from = Math.max(0, page) * pageSize;
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);
  fail(error);
  return { rows: (data ?? []) as (StockEvent & { created_by: string })[], count: count ?? 0 };
}
