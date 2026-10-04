import {
  assertExpectedRevision,
  assertProductVersionTransition,
  assertValidatedProductVersionTransition,
  PRODUCT_ENGINEERING_SCHEMA_VERSION,
  validateProductVersionDraft,
  validateProductVersionForPublication,
  type ProductEngineeringMutation,
} from "../../../shared/product-engineering";
import { EXPRESSION_AST_VERSION } from "../../../shared/calculation-engine/expressions";
import {
  componentToRow,
  inputToRow,
  mapDefinition,
  variableToRow,
} from "./mappers";

export class ServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: readonly unknown[]
  ) {
    super(message);
  }
}
const rpcError = (error: any): never => {
  const message = error?.message ?? "Persistence error";
  if (/revision|published version changed/i.test(message))
    throw new ServiceError(409, "REVISION_CONFLICT", message);
  if (/status|transition|DRAFT|VALIDATING/i.test(message))
    throw new ServiceError(409, "STATE_CONFLICT", message);
  if (/not found/i.test(message))
    throw new ServiceError(404, "NOT_FOUND", message);
  throw new ServiceError(
    500,
    "PERSISTENCE_ERROR",
    "Product Engineering persistence failed."
  );
};

export class ProductEngineeringService {
  constructor(private readonly db: any) {}
  async loadDefinition(versionId: string) {
    const { data, error } = await this.db.rpc(
      "product_engineering_get_version_definition_secure",
      { p_version_id: versionId }
    );
    if (error) rpcError(error);
    if (!data)
      throw new ServiceError(404, "VERSION_NOT_FOUND", "Version not found.");
    return mapDefinition(data);
  }
  async execute(command: ProductEngineeringMutation, actorId: string) {
    if (command.action === "CREATE_PRODUCT") {
      const { data, error } = await this.db.rpc(
        "product_engineering_create_product_secure",
        {
          p_code: command.product.code,
          p_name: command.product.name,
          p_description: command.product.description ?? null,
          p_actor_id: actorId,
          p_schema_version: PRODUCT_ENGINEERING_SCHEMA_VERSION,
          p_expression_ast_version: EXPRESSION_AST_VERSION,
        }
      );
      if (error) rpcError(error);
      return data;
    }
    const definition = await this.loadDefinition(command.versionId);
    try {
      assertExpectedRevision(
        definition.version.revision,
        command.expectedRevision
      );
    } catch {
      throw new ServiceError(
        409,
        "REVISION_CONFLICT",
        "Version revision changed."
      );
    }
    if (command.action === "SAVE_DRAFT") {
      if (definition.version.status !== "DRAFT")
        throw new ServiceError(
          409,
          "STATE_CONFLICT",
          "Only DRAFT versions can be saved."
        );
      const proposed = {
        ...definition,
        version: { ...definition.version, notes: command.notes },
        inputs: command.inputs,
        variables: command.variables,
        components: command.components,
      };
      const validation = validateProductVersionDraft(proposed);
      if (!validation.persistable)
        throw new ServiceError(
          400,
          "DOMAIN_VALIDATION_FAILED",
          "Draft is not structurally persistable.",
          validation.issues
        );
      const { data, error } = await this.db.rpc(
        "product_engineering_save_draft_secure",
        {
          p_version_id: command.versionId,
          p_expected_revision: command.expectedRevision,
          p_notes: command.notes ?? null,
          p_inputs: command.inputs.map(inputToRow),
          p_variables: command.variables.map(variableToRow),
          p_components: command.components.map(componentToRow),
        }
      );
      if (error) rpcError(error);
      return { revision: data, issues: validation.issues };
    }
    if (command.action === "RETURN_TO_DRAFT") {
      try {
        assertProductVersionTransition(definition.version.status, "DRAFT");
      } catch {
        throw new ServiceError(
          409,
          "STATE_CONFLICT",
          "Version is not VALIDATING."
        );
      }
      const { data, error } = await this.db.rpc(
        "product_engineering_transition_version_secure",
        {
          p_version_id: command.versionId,
          p_expected_revision: command.expectedRevision,
          p_target_status: "DRAFT",
        }
      );
      if (error) rpcError(error);
      return data;
    }
    const validation = validateProductVersionForPublication(definition);
    if (!validation.valid)
      throw new ServiceError(
        400,
        "DOMAIN_VALIDATION_FAILED",
        "Version has publication validation errors.",
        validation.issues
      );
    if (command.action === "START_VALIDATION") {
      try {
        assertValidatedProductVersionTransition(
          definition.version.status as "DRAFT",
          "VALIDATING",
          validation
        );
      } catch {
        throw new ServiceError(409, "STATE_CONFLICT", "Version is not DRAFT.");
      }
      const { data, error } = await this.db.rpc(
        "product_engineering_transition_version_secure",
        {
          p_version_id: command.versionId,
          p_expected_revision: command.expectedRevision,
          p_target_status: "VALIDATING",
        }
      );
      if (error) rpcError(error);
      return { version: data, issues: validation.issues };
    }
    try {
      assertValidatedProductVersionTransition(
        definition.version.status as "VALIDATING",
        "PUBLISHED",
        validation
      );
    } catch {
      throw new ServiceError(
        409,
        "STATE_CONFLICT",
        "Version is not VALIDATING."
      );
    }
    const { data: published, error: publishedError } = await this.db
      .from("product_versions")
      .select("id")
      .eq("product_id", definition.version.productId)
      .eq("status", "PUBLISHED")
      .maybeSingle();
    if (publishedError) rpcError(publishedError);
    const { data, error } = await this.db.rpc(
      "product_engineering_publish_version_secure",
      {
        p_version_id: command.versionId,
        p_expected_revision: command.expectedRevision,
        p_expected_current_published_version_id: published?.id ?? null,
        p_actor_id: actorId,
      }
    );
    if (error) rpcError(error);
    return { version: data, issues: validation.issues };
  }
}
