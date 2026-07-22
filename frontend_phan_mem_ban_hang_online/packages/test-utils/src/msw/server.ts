import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/** For Vitest (node environment) — call `server.listen()`/`server.resetHandlers()`/`server.close()`
 * in test setup. */
export const server = setupServer(...handlers);
