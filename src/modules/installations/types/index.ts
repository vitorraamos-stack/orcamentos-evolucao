export type InstallationStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";
export type InstallationTeam = {
  id: string;
  name: string;
  active: boolean;
  default_vehicle_label: string | null;
  notes: string | null;
  members?: TeamMember[];
};
export type TeamMember = {
  team_id: string;
  user_id: string;
  is_lead: boolean;
  profile?: { name?: string | null; email?: string | null } | null;
};
export type Installation = {
  id: string;
  os_id: string;
  team_id: string | null;
  responsible_id: string | null;
  status: InstallationStatus;
  scheduled_start: string;
  scheduled_end: string | null;
  estimated_duration_minutes: number | null;
  vehicle_label: string | null;
  address_snapshot: string;
  address_lat: number | null;
  address_lng: number | null;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  order?: LogisticsOrder | null;
  team?: InstallationTeam | null;
  responsible?: { name?: string | null; email?: string | null } | null;
};
export type LogisticsOrder = {
  id: string;
  sale_number: string | null;
  client_name: string;
  delivery_date: string | null;
  address: string | null;
  address_lat: number | null;
  address_lng: number | null;
  logistic_type: string | null;
  prod_status: string | null;
  archived: boolean;
  updated_at: string;
};
export type InstallationScheduleInput = {
  osId: string;
  scheduledStart: string;
  scheduledEnd?: string | null;
  teamId?: string | null;
  responsibleId?: string | null;
  estimatedDurationMinutes?: number | null;
  vehicleLabel?: string | null;
  notes?: string | null;
  overrideConflict?: boolean;
};
