import { supabase } from "@/lib/supabase";
import type { PreparationItem, PreparationOperation, PreparationSources } from "./dashboardPreparation";

const PAGE_SIZE = 500;
const IN_BATCH = 80;
const ITEM_PROJECTION = "id,order_id,name,status,updated_at";
const OPERATION_PROJECTION = "id,item_id,work_center,status,is_required,assigned_to,blocked_reason,updated_at";

/** All lookups are RLS-controlled, read-only and limited to visible OS. */
async function readByIds<T extends { id: string }>(
  table: "os_order_items" | "os_order_item_operations",
  projection: string, field: "order_id" | "item_id", ids: string[],
  signal?: AbortSignal
): Promise<T[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return [];
  const results: T[] = [];
  for (let i = 0; i < unique.length; i += IN_BATCH) {
    const chunk = unique.slice(i, i + IN_BATCH);
    for (let attempt = 0; attempt < 2; attempt++) {
      const pageRows: T[] = [];
      let expected: number | null = null;
      try {
        for (let offset = 0; ; offset += PAGE_SIZE) {
          let query = supabase.from(table)
            .select(projection, { count: "exact" })
            .in(field, chunk)
            .is("deleted_at", null)
            .order("id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
          if (signal) query = query.abortSignal(signal);
          const { data, count, error } = await query;
          if (error) throw new Error(error.message);
          if (count === null || !Number.isSafeInteger(count) || count < 0)
            throw new Error("A contagem da preparação não pôde ser confirmada.");
          if (expected === null) expected = count;
          if (expected !== count) throw new Error("Os registros de preparação mudaram durante a leitura.");
          const batch = (data ?? []) as unknown as T[];
          pageRows.push(...batch);
          if (pageRows.length >= expected) break;
          if (batch.length !== PAGE_SIZE) throw new Error("A leitura da preparação foi interrompida.");
        }
        if (pageRows.length !== expected || new Set(pageRows.map(row => row.id)).size !== expected)
          throw new Error("Os registros de preparação mudaram durante a paginação.");
        results.push(...pageRows);
        break;
      } catch (error) {
        if (signal?.aborted || attempt === 1 || !(error instanceof Error) ||
          !/mudaram|interrompida/.test(error.message)) throw error;
      }
    }
  }
  return results;
}

/** No full-table scan or stock-inventory inference. */
export async function listDashboardPreparationSources(
  orderIds: string[], signal?: AbortSignal
): Promise<PreparationSources> {
  const items = await readByIds<PreparationItem>(
    "os_order_items", ITEM_PROJECTION, "order_id", orderIds, signal
  );
  const operations = await readByIds<PreparationOperation>(
    "os_order_item_operations", OPERATION_PROJECTION,
    "item_id", items.map(item => item.id), signal
  );
  return { items, operations };
}

/** Resolve an operation's order only if its item can be seen under current RLS. */
export async function resolvePreparationOrderByItem(
  itemId: string, signal?: AbortSignal
): Promise<string | null> {
  let query = supabase.from("os_order_items").select("order_id").eq("id", itemId).maybeSingle();
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data?.order_id ?? null;
}
