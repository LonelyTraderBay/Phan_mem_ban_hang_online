import { http, HttpResponse, type JsonBodyType } from "msw";
import { handlerDescriptors } from "./generated/handlerDescriptors";
import { authHandlers } from "./authHandlers";
import { settingsHandlers } from "./settingsHandlers";
import { customerHandlers } from "./customerHandlers";
import { catalogHandlers } from "./catalogHandlers";
import { importHandlers } from "./importHandlers";

/**
 * Turns the generated descriptors into real MSW handlers. Kept as a runtime mapping step
 * (rather than emitting `http.get(...)` calls directly in codegen) so the generator only has to
 * produce plain data, not source code.
 */
const generatedHandlers = handlerDescriptors.map((descriptor) =>
  http[descriptor.method](`${descriptor.apiBaseUrl}${descriptor.path}`, () => {
    if (descriptor.status === 204) return new HttpResponse(null, { status: 204 });
    return HttpResponse.json(descriptor.body as JsonBodyType, { status: descriptor.status });
  }),
);

// Hand-written overrides come first: MSW resolves to the first matching handler.
const overrideHandlers = [
  ...authHandlers,
  ...settingsHandlers,
  ...customerHandlers,
  ...catalogHandlers,
  ...importHandlers,
];

export const handlers = [...overrideHandlers, ...generatedHandlers];
