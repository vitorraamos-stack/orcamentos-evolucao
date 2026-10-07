import {
  PRICING_ENGINE_VERSION,
  PRICING_SCHEMA_VERSION,
  assertPricingPolicyVersionTransition,
  pricingPersistenceMutationSchema,
  validatePricingPublicationReadiness,
  type PricingPersistenceMutation,
} from "../../../shared/pricing/index.js";
import {
  mapCreatePricingPolicyResult,
  mapCreatePricingVersionResult,
  mapPricingAggregate,
  mapPricingInstallationSettings,
  mapPricingPaymentTerm,
  mapPricingPolicyRow,
  mapPricingPolicyVersionRow,
  mapPricingRevisionResult,
  mapProductPricingSettings,
} from "./mappers.js";
import { mapOfficialPricingContext } from "./calculationContext.js";

export class PricingPersistenceServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: readonly unknown[]
  ) {
    super(message);
    this.name = "PricingPersistenceServiceError";
  }
}

export function mapPricingPersistenceError(error: any): never {
  const message = String(error?.message ?? "");
  const mappings: Array<[RegExp, number, string, string]> = [
    [/PRICING_POLICY_NOT_FOUND/, 404, "PRICING_POLICY_NOT_FOUND", "Pricing policy not found."],
    [/PRICING_POLICY_NOT_ACTIVE/, 409, "PRICING_POLICY_NOT_ACTIVE", "Pricing policy is not active."],
    [/PRICING_PUBLISHED_VERSION_NOT_FOUND/, 404, "PRICING_PUBLISHED_VERSION_NOT_FOUND", "Published Pricing version not found."],
    [/PRICING_PRODUCT_NOT_FOUND/, 404, "PRICING_PRODUCT_NOT_FOUND", "Product not found."],
    [/PRICING_VERSION_NOT_FOUND/, 404, "PRICING_VERSION_NOT_FOUND", "Pricing policy version not found."],
    [/PRODUCT_PRICING_SETTINGS_NOT_FOUND/, 404, "PRODUCT_PRICING_SETTINGS_NOT_FOUND", "Product Pricing settings not found."],
    [/PRICING_PAYMENT_TERM_NOT_FOUND/, 404, "PRICING_PAYMENT_TERM_NOT_FOUND", "Pricing payment term not found."],
    [/PRICING_INSTALLATION_SETTINGS_NOT_FOUND/, 404, "PRICING_INSTALLATION_SETTINGS_NOT_FOUND", "Installation settings not found."],
    [/PRICING_POLICY_CODE_CONFLICT/, 409, "PRICING_POLICY_CODE_CONFLICT", "Pricing policy code is already in use."],
    [/PRICING_REVISION_CONFLICT/, 409, "PRICING_REVISION_CONFLICT", "Pricing configuration changed since it was loaded."],
    [/PRICING_PUBLICATION_CONFLICT/, 409, "PRICING_PUBLICATION_CONFLICT", "Published Pricing version changed."],
    [/PRICING_VERSION_CONFLICT/, 409, "PRICING_VERSION_CONFLICT", "Pricing version number conflict."],
    [/PRICING_STATE_CONFLICT/, 409, "PRICING_STATE_CONFLICT", "Pricing lifecycle state conflict."],
    [/PRICING_CONFIGURATION_CONFLICT/, 409, "PRICING_CONFIGURATION_CONFLICT", "Pricing configuration conflict."],
    [/INVALID_PRICING_CONFIGURATION/, 400, "INVALID_PRICING_CONFIGURATION", "Pricing configuration is invalid."],
  ];
  for (const [pattern, status, code, safe] of mappings)
    if (pattern.test(message))
      throw new PricingPersistenceServiceError(status, code, safe);
  throw new PricingPersistenceServiceError(
    500,
    "PRICING_PERSISTENCE_ERROR",
    "Pricing persistence failed."
  );
}

const revisionMatches = (actual: number, expected: number) => {
  if (actual !== expected)
    throw new PricingPersistenceServiceError(
      409,
      "PRICING_REVISION_CONFLICT",
      "Pricing configuration changed since it was loaded."
    );
};

export class PricingPersistenceService {
  constructor(private readonly db: any) {}

  private async rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.db.rpc(name, args);
    if (error) mapPricingPersistenceError(error);
    return data;
  }

  async loadPolicy(policyId: string) {
    const data = await this.rpc("pricing_get_policy_secure", {
      p_policy_id: policyId,
    });
    if (!data)
      throw new PricingPersistenceServiceError(
        404,
        "PRICING_POLICY_NOT_FOUND",
        "Pricing policy not found."
      );
    return mapPricingPolicyRow(data);
  }

  async loadAggregate(versionId: string) {
    const data = await this.rpc("pricing_get_version_definition_secure", {
      p_version_id: versionId,
    });
    if (!data)
      throw new PricingPersistenceServiceError(
        404,
        "PRICING_VERSION_NOT_FOUND",
        "Pricing policy version not found."
      );
    return mapPricingAggregate(data);
  }

  async loadProductSettings(productId: string) {
    const data = await this.rpc("pricing_get_product_settings_secure", {
      p_product_id: productId,
    });
    if (!data)
      throw new PricingPersistenceServiceError(
        404,
        "PRODUCT_PRICING_SETTINGS_NOT_FOUND",
        "Product Pricing settings not found."
      );
    return mapProductPricingSettings(data);
  }

  async loadPaymentTerm(installments: number) {
    const data = await this.rpc("pricing_get_payment_term_secure", {
      p_installments: installments,
    });
    if (!data)
      throw new PricingPersistenceServiceError(
        404,
        "PRICING_PAYMENT_TERM_NOT_FOUND",
        "Pricing payment term not found."
      );
    return mapPricingPaymentTerm(data);
  }

  async loadInstallationSettings() {
    const data = await this.rpc("pricing_get_installation_settings_secure", {});
    if (!data)
      throw new PricingPersistenceServiceError(
        404,
        "PRICING_INSTALLATION_SETTINGS_NOT_FOUND",
        "Installation settings not found."
      );
    return mapPricingInstallationSettings(data);
  }

  async loadOfficialCalculationContext(productId: string, installments: number) {
    const data = await this.rpc("pricing_get_official_calculation_context_secure", {
      p_product_id: productId,
      p_installments: installments,
    });
    if (!data)
      throw new PricingPersistenceServiceError(
        500,
        "PRICING_PERSISTENCE_ERROR",
        "Pricing calculation context is unavailable."
      );
    return mapOfficialPricingContext(data);
  }

  async execute(input: PricingPersistenceMutation, actorId: string) {
    const command = pricingPersistenceMutationSchema.parse(input);

    if (command.action === "CREATE_POLICY") {
      const data = await this.rpc("pricing_create_policy_secure", {
        p_code: command.policy.code,
        p_name: command.policy.name,
        p_description: command.policy.description ?? null,
        p_status: command.policy.status,
        p_markup: command.markup,
        p_notes: command.notes ?? null,
        p_actor_id: actorId,
        p_schema_version: PRICING_SCHEMA_VERSION,
        p_engine_version: PRICING_ENGINE_VERSION,
        p_strategy_type: "MARKUP_ON_COST",
        p_markup_base: "TOTAL_COST",
      });
      return mapCreatePricingPolicyResult(data);
    }

    if (command.action === "UPDATE_POLICY") {
      const data = await this.rpc("pricing_update_policy_secure", {
        p_policy_id: command.policyId,
        p_expected_revision: command.expectedRevision,
        p_code: command.policy.code,
        p_name: command.policy.name,
        p_description: command.policy.description ?? null,
        p_status: command.policy.status,
        p_actor_id: actorId,
      });
      return mapPricingPolicyRow(data);
    }

    if (command.action === "ARCHIVE_POLICY") {
      const data = await this.rpc("pricing_archive_policy_secure", {
        p_policy_id: command.policyId,
        p_expected_revision: command.expectedRevision,
        p_actor_id: actorId,
      });
      return mapPricingPolicyRow(data);
    }

    if (command.action === "SET_PRODUCT_PRICING") {
      const policy = await this.loadPolicy(command.pricingPolicyId);
      if (policy.status === "ARCHIVED")
        throw new PricingPersistenceServiceError(
          409,
          "PRICING_STATE_CONFLICT",
          "Archived Pricing policies cannot be assigned."
        );
      const data = await this.rpc("pricing_set_product_settings_secure", {
        p_product_id: command.productId,
        p_pricing_policy_id: command.pricingPolicyId,
        p_minimum_selling_price: command.minimumSellingPrice,
        p_expected_revision: command.expectedRevision,
        p_actor_id: actorId,
      });
      return mapProductPricingSettings(data);
    }

    if (command.action === "SET_INSTALLATION_SETTINGS") {
      const data = await this.rpc("pricing_set_installation_settings_secure", {
        p_tier_1_max_area_m2: command.tier1MaxAreaM2,
        p_tier_1_price: command.tier1Price,
        p_tier_2_max_area_m2: command.tier2MaxAreaM2,
        p_tier_2_price: command.tier2Price,
        p_tier_3_price: command.tier3Price,
        p_munck_hourly_price: command.munckHourlyPrice,
        p_munck_minimum_hours: command.munckMinimumHours,
        p_expected_revision: command.expectedRevision,
        p_actor_id: actorId,
      });
      return mapPricingInstallationSettings(data);
    }

    if (command.action === "SET_PAYMENT_TERM") {
      const data = await this.rpc("pricing_set_payment_term_secure", {
        p_installments: command.installments,
        p_rate: command.rate,
        p_expected_revision: command.expectedRevision,
        p_actor_id: actorId,
      });
      return mapPricingPaymentTerm(data);
    }

    const sourceVersionId =
      command.action === "CREATE_VERSION"
        ? command.sourceVersionId
        : command.versionId;
    const aggregate = await this.loadAggregate(sourceVersionId);
    if (aggregate.policy.status === "ARCHIVED")
      throw new PricingPersistenceServiceError(
        409,
        "PRICING_STATE_CONFLICT",
        "Archived Pricing policies cannot be modified."
      );
    revisionMatches(
      aggregate.definition.version.revision,
      command.expectedRevision
    );

    if (command.action === "CREATE_VERSION") {
      if (aggregate.definition.version.status !== "PUBLISHED")
        throw new PricingPersistenceServiceError(
          409,
          "PRICING_STATE_CONFLICT",
          "Only PUBLISHED Pricing versions can be cloned."
        );
      const data = await this.rpc("pricing_create_version_secure", {
        p_source_version_id: command.sourceVersionId,
        p_expected_revision: command.expectedRevision,
        p_actor_id: actorId,
      });
      return mapCreatePricingVersionResult(data);
    }

    if (command.action === "SAVE_DRAFT") {
      if (aggregate.definition.version.status !== "DRAFT")
        throw new PricingPersistenceServiceError(
          409,
          "PRICING_STATE_CONFLICT",
          "Only DRAFT Pricing versions can be saved."
        );
      const data = await this.rpc("pricing_save_draft_secure", {
        p_version_id: command.versionId,
        p_expected_revision: command.expectedRevision,
        p_markup: command.markup,
        p_notes: command.notes ?? null,
        p_actor_id: actorId,
      });
      return mapPricingRevisionResult(data);
    }

    if (command.action === "RETURN_TO_DRAFT") {
      try {
        assertPricingPolicyVersionTransition(
          aggregate.definition.version.status,
          "DRAFT"
        );
      } catch {
        throw new PricingPersistenceServiceError(
          409,
          "PRICING_STATE_CONFLICT",
          "Pricing version is not VALIDATING."
        );
      }
      const data = await this.rpc("pricing_transition_version_secure", {
        p_version_id: command.versionId,
        p_expected_revision: command.expectedRevision,
        p_target_status: "DRAFT",
        p_actor_id: actorId,
      });
      return { version: mapPricingPolicyVersionRow(data) };
    }

    const readiness = validatePricingPublicationReadiness(
      aggregate.policy,
      aggregate.definition
    );
    if (!readiness.ready)
      throw new PricingPersistenceServiceError(
        400,
        "PRICING_PUBLICATION_NOT_READY",
        "Pricing version has publication validation errors.",
        readiness.issues
      );

    if (command.action === "START_VALIDATION") {
      try {
        assertPricingPolicyVersionTransition(
          aggregate.definition.version.status,
          "VALIDATING"
        );
      } catch {
        throw new PricingPersistenceServiceError(
          409,
          "PRICING_STATE_CONFLICT",
          "Pricing version is not DRAFT."
        );
      }
      const data = await this.rpc("pricing_transition_version_secure", {
        p_version_id: command.versionId,
        p_expected_revision: command.expectedRevision,
        p_target_status: "VALIDATING",
        p_actor_id: actorId,
      });
      return { version: mapPricingPolicyVersionRow(data), issues: readiness.issues };
    }

    try {
      assertPricingPolicyVersionTransition(
        aggregate.definition.version.status,
        "PUBLISHED"
      );
    } catch {
      throw new PricingPersistenceServiceError(
        409,
        "PRICING_STATE_CONFLICT",
        "Pricing version is not VALIDATING."
      );
    }
    const data = await this.rpc("pricing_publish_version_secure", {
      p_version_id: command.versionId,
      p_expected_revision: command.expectedRevision,
      p_expected_current_published_version_id:
        command.expectedCurrentPublishedVersionId,
      p_actor_id: actorId,
    });
    return { version: mapPricingPolicyVersionRow(data), issues: readiness.issues };
  }
}
