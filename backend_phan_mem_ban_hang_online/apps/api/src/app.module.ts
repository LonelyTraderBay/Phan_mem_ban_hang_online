import { Module, type DynamicModule, type Type } from "@nestjs/common";
import { loadConfig } from "@ai-sales/config";
import { createDatabase } from "@ai-sales/database";
import {
  createWalkingSkeletonController,
  PostgresAuditWriter,
  PostgresOutboxWriter,
  PostgresWalkingSkeletonTracer
} from "@ai-sales/module-audit";
import { HealthController } from "./health.controller";

function buildControllers(): Type<unknown>[] {
  const config = loadConfig(process.env);
  const controllers: Type<unknown>[] = [HealthController];

  if (config.WALKING_SKELETON_ENABLED && config.DATABASE_URL) {
    const db = createDatabase(config.DATABASE_URL);
    const auditWriter = new PostgresAuditWriter(db);
    const outboxWriter = new PostgresOutboxWriter(db);
    const tracer = new PostgresWalkingSkeletonTracer(db, auditWriter, outboxWriter);
    controllers.push(createWalkingSkeletonController({ enabled: true, tracer }));
  }

  return controllers;
}

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return {
      module: AppModule,
      controllers: buildControllers()
    };
  }
}
