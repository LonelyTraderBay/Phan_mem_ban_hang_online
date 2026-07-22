import { Controller, Get } from "@nestjs/common";
import { buildHealthPayload, type HealthPayload } from "./health";

@Controller()
export class HealthController {
  @Get("/health")
  health(): HealthPayload {
    return buildHealthPayload("api");
  }

  @Get("/ready")
  ready(): HealthPayload {
    return buildHealthPayload("api");
  }
}
