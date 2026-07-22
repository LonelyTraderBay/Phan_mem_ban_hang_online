export const MODULE_NAME = "payment" as const;

export {
  confirmPayment,
  createRefund,
  listOrderPayments,
  normalizeProviderCallbackStub,
  PaymentError,
  processProviderCallbackStub,
  recordPayment,
  requirePaymentPermission,
  verifyProviderCallbackSignatureStub,
  type OrderLookupPort,
  type PaymentErrorCode,
  type PaymentPermission,
  type PaymentRecord,
  type PaymentRepository,
  type PaymentResource,
  type PaymentStatus
} from "./application/payment.js";

export { InMemoryPaymentRepository } from "./infrastructure/persistence/in-memory-payment.js";
export { createPaymentController } from "./presentation/http/payment.controller.js";
