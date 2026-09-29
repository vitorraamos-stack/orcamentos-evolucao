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
export type InstallationChecklistPhase = "PRE_START" | "COMPLETION";
export type InstallationChecklistStatus = "PENDING" | "DONE" | "NOT_APPLICABLE";
export type InstallationChecklistItem = {
  id: string;
  installation_id: string;
  phase: InstallationChecklistPhase;
  code: string;
  label: string;
  status: InstallationChecklistStatus;
  is_required: boolean;
  allow_not_applicable: boolean;
  note: string | null;
  completed_by: string | null;
  completed_at: string | null;
  sort_order: number;
};
export type InstallationEvidencePhase = "BEFORE" | "DURING" | "AFTER";
export type InstallationEvidence = {
  id: string;
  installation_id: string;
  asset_id: string;
  phase: InstallationEvidencePhase;
  note: string | null;
  created_by: string | null;
  created_at: string;
  asset?: {
    object_path: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
  } | null;
  creator?: { name?: string | null; email?: string | null } | null;
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
  completion_notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
  updated_at: string;
  order?: LogisticsOrder | null;
  team?: InstallationTeam | null;
  responsible?: { name?: string | null; email?: string | null } | null;
};
export type InstallationActions = {
  canStart: boolean;
  canComplete: boolean;
  canCancel: boolean;
  canReschedule: boolean;
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
