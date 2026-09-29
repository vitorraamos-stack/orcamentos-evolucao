import { supabase } from "@/lib/supabase";
import { loadHubUsersByRoles } from "@/shared/repositories/hubUsersRepository";
import type {
  Installation,
  InstallationScheduleInput,
  InstallationTeam,
  LogisticsOrder,
} from "../types";
const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};
export async function loadInstallationWorkspace() {
  const [installations, teams, members, orders, profiles] = await Promise.all([
    supabase
      .from("os_installations")
      .select("*")
      .order("scheduled_start", { ascending: true })
      .limit(250),
    supabase.from("os_installation_teams").select("*").order("name"),
    supabase.from("os_installation_team_members").select("*"),
    supabase
      .from("os_orders")
      .select(
        "id,sale_number,client_name,delivery_date,address,address_lat,address_lng,logistic_type,prod_status,archived,updated_at"
      )
      .eq("logistic_type", "instalacao")
      .eq("archived", false)
      .in("prod_status", ["Pronto / Avisar Cliente", "Instalação Agendada"])
      .limit(200),
    loadHubUsersByRoles(["instalador", "gerente", "admin"]),
  ]);
  [installations, teams, members, orders].forEach(r => fail(r.error));
  const teamRows = (teams.data ?? []) as InstallationTeam[];
  const orderMap = new Map((orders.data ?? []).map(o => [o.id, o]));
  return {
    installations: (installations.data ?? []).map(i => ({
      ...i,
      order: orderMap.get(i.os_id) ?? null,
      team: teamRows.find(t => t.id === i.team_id) ?? null,
      responsible: profiles.find(p => p.id === i.responsible_id) ?? null,
    })) as Installation[],
    teams: teamRows,
    members: members.data ?? [],
    orders: (orders.data ?? []) as LogisticsOrder[],
    profiles,
  };
}
export async function scheduleInstallation(i: InstallationScheduleInput) {
  const { data, error } = await supabase.rpc(
    "hub_os_schedule_installation_secure",
    {
      p_os_id: i.osId,
      p_scheduled_start: i.scheduledStart,
      p_scheduled_end: i.scheduledEnd ?? null,
      p_team_id: i.teamId ?? null,
      p_responsible_id: i.responsibleId ?? null,
      p_estimated_duration_minutes: i.estimatedDurationMinutes ?? null,
      p_vehicle_label: i.vehicleLabel ?? null,
      p_notes: i.notes ?? null,
      p_override_conflict: i.overrideConflict ?? false,
    }
  );
  fail(error);
  return data;
}
export async function rescheduleInstallation(
  id: string,
  i: Omit<InstallationScheduleInput, "osId">
) {
  const { data, error } = await supabase.rpc(
    "hub_os_reschedule_installation_secure",
    {
      p_installation_id: id,
      p_scheduled_start: i.scheduledStart,
      p_scheduled_end: i.scheduledEnd ?? null,
      p_team_id: i.teamId ?? null,
      p_responsible_id: i.responsibleId ?? null,
      p_estimated_duration_minutes: i.estimatedDurationMinutes ?? null,
      p_vehicle_label: i.vehicleLabel ?? null,
      p_notes: i.notes ?? null,
      p_override_conflict: i.overrideConflict ?? false,
    }
  );
  fail(error);
  return data;
}
export async function installationAction(
  action: "start" | "complete" | "cancel",
  id: string,
  reason?: string
) {
  const names = {
    start: "hub_os_start_installation_secure",
    complete: "hub_os_complete_installation_secure",
    cancel: "hub_os_cancel_installation_secure",
  } as const;
  const args =
    action === "cancel"
      ? { p_installation_id: id, p_cancelled_reason: reason }
      : { p_installation_id: id };
  const { error } = await supabase.rpc(names[action], args);
  fail(error);
}
export async function saveTeam(team: {
  id?: string;
  name: string;
  active?: boolean;
  defaultVehicle?: string;
  notes?: string;
}) {
  const rpc = team.id
    ? "hub_os_update_installation_team_secure"
    : "hub_os_create_installation_team_secure";
  const { data, error } = await supabase.rpc(
    rpc,
    team.id
      ? {
          p_team_id: team.id,
          p_name: team.name,
          p_active: team.active ?? true,
          p_default_vehicle_label: team.defaultVehicle ?? null,
          p_notes: team.notes ?? null,
        }
      : {
          p_name: team.name,
          p_default_vehicle_label: team.defaultVehicle ?? null,
          p_notes: team.notes ?? null,
        }
  );
  fail(error);
  return data as InstallationTeam;
}
export async function setTeamMembers(
  teamId: string,
  members: Array<{ userId: string; isLead: boolean }>
) {
  const { error } = await supabase.rpc(
    "hub_os_set_installation_team_members_secure",
    {
      p_team_id: teamId,
      p_members: members.map(m => ({ user_id: m.userId, is_lead: m.isLead })),
    }
  );
  fail(error);
}
