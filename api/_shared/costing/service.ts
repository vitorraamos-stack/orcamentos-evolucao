import {
  costingMutationSchema,
  type CostingMutation,
} from "../../../shared/costing/api.js";
import type { CostResourceType } from "../../../shared/costing/resources.js";
import {
  mapRate,
  mapRateSeries,
  mapResourceResult,
  mapResourceRow,
} from "./mappers.js";

export class CostingServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const TABLES: Record<CostResourceType, string> = {
  MATERIAL: "material_definitions",
  PROCESS: "process_definitions",
  OUTSOURCED_SERVICE: "outsourced_service_definitions",
  FIXED_COST: "fixed_cost_definitions",
};

export function mapCostingPersistenceError(error: any): never {
  const message = String(error?.message ?? "");
  const mappings: Array<[RegExp, number, string, string]> = [
    [
      /RESOURCE_NOT_FOUND/,
      404,
      "RESOURCE_NOT_FOUND",
      "Cost resource not found.",
    ],
    [
      /RESOURCE_CODE_CONFLICT|duplicate key.*code/i,
      409,
      "RESOURCE_CODE_CONFLICT",
      "Resource code is already in use.",
    ],
    [
      /RESOURCE_CONCURRENCY_CONFLICT/,
      409,
      "RESOURCE_CONCURRENCY_CONFLICT",
      "Resource changed since it was loaded.",
    ],
    [
      /COST_UNIT_IN_USE|resource_unit_fk/i,
      409,
      "COST_UNIT_IN_USE",
      "Cost unit is already used by rate history.",
    ],
    [
      /COST_RATE_EFFECTIVE_FROM_CONFLICT/,
      409,
      "COST_RATE_EFFECTIVE_FROM_CONFLICT",
      "Effective date must follow the current rate.",
    ],
    [
      /COST_RATE_OVERLAP|intervals cannot overlap/i,
      409,
      "COST_RATE_OVERLAP",
      "Cost rate intervals cannot overlap.",
    ],
    [
      /INVALID_COST_RATE|amount_nonnegative/i,
      400,
      "INVALID_COST_RATE",
      "Cost rate is invalid.",
    ],
  ];
  for (const [pattern, status, code, safe] of mappings)
    if (pattern.test(message))
      throw new CostingServiceError(status, code, safe);
  throw new CostingServiceError(
    500,
    "PERSISTENCE_ERROR",
    "Costing persistence failed."
  );
}

export class CostingService {
  constructor(private readonly db: any) {}

  async listResources(type: CostResourceType) {
    const { data, error } = await this.db
      .from(TABLES[type])
      .select("id,code,name,description,status,cost_unit,updated_at")
      .order("code");
    if (error) mapCostingPersistenceError(error);
    return (data ?? []).map((row: unknown) => mapResourceRow(type, row));
  }

  async loadResource(type: CostResourceType, id: string) {
    const { data, error } = await this.db
      .from(TABLES[type])
      .select("id,code,name,description,status,cost_unit,updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) mapCostingPersistenceError(error);
    if (!data)
      throw new CostingServiceError(
        404,
        "RESOURCE_NOT_FOUND",
        "Cost resource not found."
      );
    const mapped = mapResourceRow(type, data);
    const series = await this.db.rpc("costing_get_rate_series_secure", {
      p_type: type,
      p_resource_id: id,
    });
    if (series.error) mapCostingPersistenceError(series.error);
    return { ...mapped, rates: mapRateSeries(series.data) };
  }

  async execute(input: CostingMutation, actorId: string) {
    const command = costingMutationSchema.parse(input);
    if (command.action === "CREATE_RESOURCE") {
      const { data, error } = await this.db.rpc(
        "costing_create_resource_secure",
        {
          p_type: command.resource.type,
          p_code: command.resource.code,
          p_name: command.resource.name,
          p_description: command.resource.description,
          p_cost_unit: command.resource.costUnit,
          p_actor_id: actorId,
        }
      );
      if (error) mapCostingPersistenceError(error);
      return mapResourceResult(data);
    }
    if (command.action === "UPDATE_RESOURCE") {
      const { resource } = command;
      const { data, error } = await this.db.rpc(
        "costing_update_resource_secure",
        {
          p_type: resource.type,
          p_resource_id: resource.id,
          p_code: resource.code,
          p_name: resource.name,
          p_description: resource.description,
          p_status: resource.status,
          p_cost_unit: resource.costUnit,
          p_expected_updated_at: command.expectedUpdatedAt,
          p_actor_id: actorId,
        }
      );
      if (error) mapCostingPersistenceError(error);
      return mapResourceResult(data);
    }
    const { data, error } = await this.db.rpc(
      "costing_set_current_rate_secure",
      {
        p_type: command.type,
        p_resource_id: command.resourceId,
        p_amount: command.amount,
        p_effective_from: command.effectiveFrom,
        p_actor_id: actorId,
      }
    );
    if (error) mapCostingPersistenceError(error);
    return {
      rate: mapRate(data?.rate),
      ...(data?.closedRateId ? { closedRateId: data.closedRateId } : {}),
    };
  }
}
