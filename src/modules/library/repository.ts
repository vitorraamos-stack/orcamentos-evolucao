import { supabase } from "@/lib/supabase";
import type { LibraryDraft, LibraryProductRecord, LibraryPublishedRecord } from "./model";

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function listLibraryDrafts(): Promise<LibraryProductRecord[]> {
  const { data, error } = await supabase.from("library_products")
    .select("id,draft,revision,status,published_version,published_revision,updated_at")
    .order("updated_at",{ascending:false});
  fail(error);
  return (data ?? []) as LibraryProductRecord[];
}

export async function listLibraryPublications(): Promise<LibraryPublishedRecord[]> {
  const { data, error } = await supabase.from("library_publications")
    .select("product_id,version,content,published_at")
    .order("published_at",{ascending:false});
  fail(error);
  return (data ?? []) as LibraryPublishedRecord[];
}

export async function createLibraryDraft(userId:string, draft:LibraryDraft):Promise<string> {
  const {data,error} = await supabase.from("library_products")
    .insert({created_by:userId,draft}).select("id").single();
  fail(error);
  if (!data?.id) throw new Error("Não foi possível identificar o novo produto.");
  return data.id;
}

export class LibraryDraftConflictError extends Error {
  constructor() {
    super("Esta ficha foi atualizada por outra pessoa. Suas alterações locais foram preservadas.");
    this.name = "LibraryDraftConflictError";
  }
}

export async function saveLibraryDraft(
  product: LibraryProductRecord, draft: LibraryDraft
): Promise<LibraryProductRecord> {
  // Compare-and-swap: never accept a stale editor revision.
  // Returning the row avoids a separate SELECT race after the UPDATE.
  const { data, error } = await supabase.from("library_products")
    .update({ draft })
    .eq("id", product.id)
    .eq("revision", product.revision)
    .select("id,draft,revision,status,published_version,published_revision,updated_at")
    .maybeSingle();
  fail(error);
  if (!data) throw new LibraryDraftConflictError();
  return data as LibraryProductRecord;
}

export async function publishLibraryDraft(product:LibraryProductRecord):Promise<number> {
  const {data,error} = await supabase.rpc("library_publish_product",{
    p_product_id:product.id,p_expected_revision:product.revision
  });
  fail(error);
  const version = Number(data);
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new Error("Não foi possível confirmar a versão publicada.");
  }
  return version;
}

export async function archiveLibraryProduct(productId:string):Promise<void> {
  const {error}=await supabase.rpc("library_archive_product",{p_product_id:productId});
  fail(error);
}

export async function restoreLibraryProduct(productId:string):Promise<void> {
  const {error}=await supabase.rpc("library_restore_product",{p_product_id:productId});
  fail(error);
}
