import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma, type BackgroundJob } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";

export type JobHandler = (payload: Prisma.JsonObject) => Promise<void>;

export class PermanentJobError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly workerId = randomUUID();
  private readonly handlers = new Map<string, JobHandler>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  register(type: string, handler: JobHandler): void {
    if (this.handlers.has(type))
      throw new Error(`Job handler already registered: ${type}`);
    this.handlers.set(type, handler);
  }

  async enqueue(
    database: Prisma.TransactionClient | PrismaService,
    input: {
      type: string;
      dedupeKey: string;
      payload: Prisma.InputJsonObject;
      runAt?: Date;
      maxAttempts?: number;
    },
  ): Promise<void> {
    await database.backgroundJob.upsert({
      where: { dedupeKey: input.dedupeKey },
      create: {
        type: input.type,
        dedupeKey: input.dedupeKey,
        payload: input.payload,
        runAt: input.runAt ?? new Date(),
        maxAttempts: input.maxAttempts ?? 5,
      },
      update: {},
    });
  }

  async runNext(): Promise<boolean> {
    const job = await this.claim();
    if (!job) return false;
    const startedAt = Date.now();
    const handler = this.handlers.get(job.type);
    if (!handler) {
      await this.fail(job, new PermanentJobError("JOB_HANDLER_MISSING"));
      return true;
    }
    try {
      await handler(job.payload as Prisma.JsonObject);
      await this.prisma.backgroundJob.updateMany({
        where: { id: job.id, leaseOwner: this.workerId, status: "RUNNING" },
        data: {
          status: "SUCCEEDED",
          completedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
        },
      });
      this.logger.log({
        event: "background_job_completed",
        jobId: job.id,
        jobType: job.type,
        attempt: job.attempts,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      await this.fail(job, error);
    }
    return true;
  }

  private async claim(): Promise<BackgroundJob | undefined> {
    return this.prisma.withTransaction(async (database) => {
      const rows = await database.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "BackgroundJob"
        WHERE (
          "status" IN ('PENDING', 'FAILED')
          OR ("status" = 'RUNNING' AND "leaseExpiresAt" < NOW())
        )
          AND "runAt" <= NOW()
          AND "attempts" < "maxAttempts"
        ORDER BY "runAt", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
      const id = rows[0]?.id;
      if (!id) return undefined;
      return database.backgroundJob.update({
        where: { id },
        data: {
          status: "RUNNING",
          attempts: { increment: 1 },
          leaseOwner: this.workerId,
          leaseExpiresAt: new Date(Date.now() + 5 * 60_000),
        },
      });
    });
  }

  private async fail(job: BackgroundJob, error: unknown): Promise<void> {
    const permanent = error instanceof PermanentJobError;
    const code = permanent ? error.code : this.safeErrorCode(error);
    const exhausted = job.attempts >= job.maxAttempts;
    const delaySeconds = Math.min(15 * 2 ** Math.max(0, job.attempts - 1), 900);
    await this.prisma.backgroundJob.updateMany({
      where: { id: job.id, leaseOwner: this.workerId },
      data: {
        status: permanent || exhausted ? "DEAD" : "FAILED",
        runAt: new Date(Date.now() + delaySeconds * 1000),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: code,
        ...(permanent || exhausted ? { completedAt: new Date() } : {}),
      },
    });
    this.logger.error({
      event: "background_job_failed",
      jobId: job.id,
      jobType: job.type,
      attempt: job.attempts,
      outcome: permanent || exhausted ? "dead" : "retry",
      errorCode: code,
    });
  }

  private safeErrorCode(error: unknown): string {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[A-Z0-9_]{1,80}$/.test(error.code)
    ) {
      return error.code;
    }
    return "JOB_EXECUTION_FAILED";
  }
}
