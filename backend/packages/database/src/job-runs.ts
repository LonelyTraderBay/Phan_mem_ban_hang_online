import { generateUuidV7 } from "@ai-sales/domain-kernel";
import { sql } from "kysely";

export type JobRunStatus = "running" | "succeeded" | "failed";

/** Best-effort job_runs write for worker observability (P7). */
export async function recordJobRunStart(
  // AppDatabase / Kysely generics vary by package boundary — sql.execute accepts the pool client.
  db: { destroy?: () => Promise<void> },
  options: { readonly jobName: string; readonly queueName: string; readonly metadata?: Record<string, unknown> }
): Promise<string> {
  const id = generateUuidV7();
  await sql`
    insert into app.job_runs (id, job_name, queue_name, status, metadata)
    values (
      ${id}::uuid,
      ${options.jobName},
      ${options.queueName},
      'running',
      ${JSON.stringify(options.metadata ?? {})}::jsonb
    )
  `.execute(db as never);
  return id;
}

export async function recordJobRunFinish(
  db: { destroy?: () => Promise<void> },
  options: {
    readonly id: string;
    readonly status: Exclude<JobRunStatus, "running">;
    readonly errorRedacted?: string | null;
  }
): Promise<void> {
  await sql`
    update app.job_runs
    set
      status = ${options.status},
      finished_at = now(),
      error_redacted = ${options.errorRedacted ?? null}
    where id = ${options.id}::uuid
  `.execute(db as never);
}
