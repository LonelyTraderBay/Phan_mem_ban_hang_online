export const MODULE_NAME = "operations" as const;

export {
  OperationsError,
  createReprocessRequest,
  createSupportAccessForOps,
  disableTenantAI,
  getAiHealth,
  getTenantHealth,
  listSystemAlerts,
  listTenantsForOperations,
  requireOpsPermission,
  setTenantFeatureFlag,
  type OpsPermission,
  type OperationsRepository
} from "./application/operations.js";

export { InMemoryOperationsRepository } from "./infrastructure/persistence/in-memory-operations.js";
export {
  PLATFORM_OPS_TENANT,
  PostgresOperationsRepository
} from "./infrastructure/persistence/postgres-operations.js";
export { createOperationsController } from "./presentation/http/operations.controller.js";
