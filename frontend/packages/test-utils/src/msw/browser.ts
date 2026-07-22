import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

/** For Storybook / local dev-without-backend — call `worker.start()` once at app/Storybook
 * bootstrap. */
export const worker = setupWorker(...handlers);
