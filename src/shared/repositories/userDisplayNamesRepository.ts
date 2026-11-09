import { supabase } from "@/lib/supabase";

export type UserDisplayName = {
  id: string;
  name: string;
  email: string | null;
};

type DisplayNameRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

/** Resolves the existing registered names without changing user identities or permissions. */
export async function loadUserDisplayNamesByIds(
  ids: string[]
): Promise<Map<string, UserDisplayName>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) return new Map();

  const { data, error } = await supabase.rpc("get_user_display_names", {
    user_ids: uniqueIds,
  });
  if (error) throw new Error(error.message);

  return new Map(
    ((data ?? []) as DisplayNameRow[]).map(row => [
      row.id,
      {
        id: row.id,
        name: row.full_name?.trim() || row.email || "Usuário",
        email: row.email,
      },
    ])
  );
}
