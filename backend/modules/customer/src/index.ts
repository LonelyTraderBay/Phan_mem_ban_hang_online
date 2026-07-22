export const MODULE_NAME = "customer" as const;

export {
  CustomerError,
  addCustomerIdentity,
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
  toCustomerResponseData,
  formatEtag,
  parseIfMatchVersion,
  hashNormalizedIdentity,
  requireCustomerPermission,
  type CustomerRepository,
  type CustomerResource,
  type CustomerIdentityRecord,
  type CustomerIdentityType,
  type CustomerStatus,
  type CustomerErrorCode
} from "./application/customers.js";

export { InMemoryCustomerRepository } from "./infrastructure/persistence/in-memory-customers.js";
export { createCustomersController } from "./presentation/http/customers.controller.js";
