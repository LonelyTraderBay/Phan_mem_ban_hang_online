// `server` (msw/node) and `worker` (msw/browser) are deliberately NOT re-exported here — each
// pulls in an environment-specific MSW entrypoint that would leak into the wrong bundle target.
// Import them directly: `@ai-sales/test-utils/msw/server` (Vitest) or
// `@ai-sales/test-utils/msw/browser` (Storybook/browser dev-without-backend).
export { handlers } from "./msw/handlers";
export { authHandlers } from "./msw/authHandlers";
export type { HandlerDescriptor } from "./msw/generated/handlerDescriptors";
export { buildGenericResource, resetGenericResourceCounter } from "./factories/genericResource";
export { buildSessionBootstrap } from "./factories/sessionBootstrap";
