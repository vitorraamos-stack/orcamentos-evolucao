import { supabase } from "@/lib/supabase";
import { loadUserDisplayNamesByIds } from "./userDisplayNamesRepository";

type ProfileRow = {
  id: string;
  email: string | null;
  role: string;
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

  const displays = await loadUserDisplayNamesByIds(profiles.map(profile => profile.id));

  return profiles.map(profile => {
    const display = displays.get(profile.id);
    const email = display?.email ?? profile.email;

    return {
      id: profile.id,
      name: display?.name || email || "Usuário",
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
