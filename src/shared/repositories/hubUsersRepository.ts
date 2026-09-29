import { supabase } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  email: string | null;
  role: string;
};

type UserDisplayRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type HubUser = {
  id: string;
  name: string;
  email: string | null;
  role: string;
};

const throwIfError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

async function resolveHubUsers(profiles: ProfileRow[]): Promise<HubUser[]> {
  if (profiles.length === 0) return [];

  const { data: displayData, error: displayError } = await supabase.rpc(
    "get_user_display_names",
    { user_ids: profiles.map(profile => profile.id) }
  );

  throwIfError(displayError);

  const displays = new Map(
    ((displayData ?? []) as UserDisplayRow[]).map(display => [
      display.id,
      display,
    ])
  );

  return profiles.map(profile => {
    const display = displays.get(profile.id);
    const email = display?.email ?? profile.email;

    return {
      id: profile.id,
      name: display?.full_name || email || "Usuário",
      email,
      role: profile.role,
    };
  });
}

export async function loadHubUsersByRoles(roles: string[]): Promise<HubUser[]> {
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,role")
    .in("role", roles);

  throwIfError(profileError);

  return resolveHubUsers((profileData ?? []) as ProfileRow[]);
}

export async function loadHubUsersByIds(ids: string[]): Promise<HubUser[]> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,role")
    .in("id", uniqueIds);

  throwIfError(profileError);

  return resolveHubUsers((profileData ?? []) as ProfileRow[]);
}
