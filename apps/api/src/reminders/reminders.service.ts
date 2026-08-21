import {
  HttpStatus,
  Inject,
  Injectable,
  type OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../http/api.exception";
import { JobsService, PermanentJobError } from "../jobs/jobs.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { CreateReminderDto, ReminderPageQueryDto } from "./reminders.dto";

@Injectable()
export class RemindersService implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.jobs.register("REMINDER_DELIVER", async (payload) => {
      if (typeof payload.reminderId !== "string")
        throw new PermanentJobError("INVALID_JOB_PAYLOAD");
      await this.deliver(payload.reminderId);
    });
  }

  async create(senderId: string, input: CreateReminderDto) {
    if (
      senderId === input.recipientId ||
      Boolean(input.groupId) === Boolean(input.friendshipId)
    )
      throw this.notAllowed();
    const scheduledFor = input.scheduledFor
      ? new Date(input.scheduledFor)
      : new Date();
    if (Number.isNaN(scheduledFor.getTime())) throw this.notAllowed();
    if (input.scheduledFor) {
      const delta = scheduledFor.getTime() - Date.now();
      if (delta < 15 * 60_000 || delta > 30 * 24 * 60 * 60_000)
        throw this.notAllowed();
    }
    await this.requireContext(
      senderId,
      input.recipientId,
      input.groupId,
      input.friendshipId,
    );
    const outstanding = await this.outstanding(
      senderId,
      input.recipientId,
      input.currency,
      input.groupId,
      input.friendshipId,
    );
    if (outstanding <= 0n) throw this.notAllowed();
    const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
    const duplicate = await this.prisma.reminder.findFirst({
      where: {
        senderId,
        recipientId: input.recipientId,
        createdAt: { gte: cutoff },
        status: { in: ["SCHEDULED", "COMPLETED"] },
      },
    });
    if (duplicate)
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        "REMINDER_RATE_LIMITED",
        "A reminder was sent recently",
      );
    let reminder;
    try {
      reminder = await this.prisma.withTransaction(async (database) => {
        const row = await database.reminder.create({
          data: {
            senderId,
            recipientId: input.recipientId,
            groupId: input.groupId ?? null,
            friendshipId: input.friendshipId ?? null,
            currency: input.currency,
            outstandingMinor: outstanding,
            scheduledFor,
          },
        });
        await this.jobs.enqueue(database, {
          type: "REMINDER_DELIVER",
          dedupeKey: `reminder:${row.id}`,
          payload: { reminderId: row.id },
          runAt: scheduledFor,
        });
        return row;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ApiException(
          HttpStatus.TOO_MANY_REQUESTS,
          "REMINDER_RATE_LIMITED",
          "A reminder is already pending",
        );
      throw error;
    }
    return this.present(reminder);
  }

  async list(userId: string, query: ReminderPageQueryDto) {
    const offset = query.cursor
      ? Number(Buffer.from(query.cursor, "base64url").toString("utf8"))
      : 0;
    if (!Number.isInteger(offset) || offset < 0)
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_CURSOR",
        "Invalid cursor",
      );
    const where =
      query.direction === "sent"
        ? { senderId: userId }
        : { recipientId: userId };
    const [rows, count] = await Promise.all([
      this.prisma.reminder.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: query.limit,
      }),
      this.prisma.reminder.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.present(row)),
      nextCursor:
        offset + query.limit < count
          ? Buffer.from(String(offset + query.limit)).toString("base64url")
          : null,
    };
  }

  async cancel(userId: string, id: string) {
    const changed = await this.prisma.reminder.updateMany({
      where: {
        id,
        senderId: userId,
        status: "SCHEDULED",
        scheduledFor: { gt: new Date() },
      },
      data: { status: "CANCELED", canceledAt: new Date() },
    });
    if (!changed.count)
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "REMINDER_NOT_FOUND",
        "Reminder was not found",
      );
    await this.prisma.backgroundJob.updateMany({
      where: {
        dedupeKey: `reminder:${id}`,
        status: { in: ["PENDING", "FAILED"] },
      },
      data: { status: "CANCELED", completedAt: new Date() },
    });
    return { id, status: "CANCELED" };
  }

  private async deliver(id: string): Promise<void> {
    const reminder = await this.prisma.reminder.findUnique({ where: { id } });
    if (!reminder || reminder.status !== "SCHEDULED") return;
    try {
      await this.requireContext(
        reminder.senderId,
        reminder.recipientId,
        reminder.groupId ?? undefined,
        reminder.friendshipId ?? undefined,
      );
    } catch {
      await this.skip(reminder.id, "CONTEXT_UNAVAILABLE", 0n);
      return;
    }
    const outstanding = await this.outstanding(
      reminder.senderId,
      reminder.recipientId,
      reminder.currency,
      reminder.groupId ?? undefined,
      reminder.friendshipId ?? undefined,
    );
    const recipient = await this.prisma.user.findUnique({
      where: { id: reminder.recipientId },
    });
    if (outstanding <= 0n || !recipient || recipient.status !== "ACTIVE") {
      await this.skip(
        id,
        outstanding <= 0n ? "OBLIGATION_SETTLED" : "RECIPIENT_UNAVAILABLE",
        outstanding > 0n ? outstanding : 0n,
      );
      return;
    }
    await this.prisma.withTransaction(async (database) => {
      const targetId = reminder.groupId ?? reminder.friendshipId;
      const notification = await this.notifications.create(database, {
        recipientId: reminder.recipientId,
        actorId: reminder.senderId,
        category: "REMINDERS",
        type: "PAYMENT_REMINDER",
        sourceType: "REMINDER",
        sourceId: reminder.id,
        dedupeKey: `reminder:${reminder.id}`,
        targetType: reminder.groupId ? "GROUP_BALANCE" : "FRIEND_BALANCE",
        ...(targetId ? { targetId } : {}),
        payload: { currency: reminder.currency },
      });
      await database.reminder.update({
        where: { id },
        data: {
          status: notification ? "COMPLETED" : "SKIPPED",
          outcomeCode: notification ? null : "PREFERENCE_SUPPRESSED",
          processedAt: new Date(),
          processedAmountMinor: outstanding,
        },
      });
    });
  }

  private async requireContext(
    senderId: string,
    recipientId: string,
    groupId?: string,
    friendshipId?: string,
  ) {
    if (groupId) {
      const count = await this.prisma.groupMember.count({
        where: {
          groupId,
          userId: { in: [senderId, recipientId] },
          leftAt: null,
          group: { status: "ACTIVE" },
          user: { status: "ACTIVE" },
        },
      });
      if (count !== 2) throw this.notAllowed();
      return;
    }
    if (!friendshipId) throw this.notAllowed();
    const row = await this.prisma.friendship.findFirst({
      where: {
        id: friendshipId,
        status: "ACCEPTED",
        firstUserId: { in: [senderId, recipientId] },
        secondUserId: { in: [senderId, recipientId] },
        firstUser: { status: "ACTIVE" },
        secondUser: { status: "ACTIVE" },
      },
    });
    if (!row) throw this.notAllowed();
  }

  private async outstanding(
    creditorId: string,
    debtorId: string,
    currency: string,
    groupId?: string,
    friendshipId?: string,
  ): Promise<bigint> {
    const rows = await this.prisma.$queryRaw<Array<{ net: bigint }>>(Prisma.sql`
      WITH current_entries AS (
        SELECT le."debtorId", le."creditorId", le."amountMinor"
        FROM "LedgerEntry" le
        JOIN "ExpenseRevision" revision ON revision.id = le."revisionId"
        JOIN "Expense" expense ON expense."currentRevisionId" = revision.id AND expense.status = 'ACTIVE'
        WHERE le.currency = ${currency}
          AND (${groupId ?? null}::uuid IS NULL OR expense."groupId" = ${groupId ?? null}::uuid)
          AND (${friendshipId ?? null}::uuid IS NULL OR expense."friendshipId" = ${friendshipId ?? null}::uuid)
        UNION ALL
        SELECT le."debtorId", le."creditorId", le."amountMinor"
        FROM "LedgerEntry" le
        JOIN "SettlementRevision" revision ON revision.id = le."settlementRevisionId"
        JOIN "Settlement" settlement ON settlement."currentRevisionId" = revision.id AND settlement.status = 'ACTIVE'
        WHERE le.currency = ${currency}
          AND (${groupId ?? null}::uuid IS NULL OR settlement."groupId" = ${groupId ?? null}::uuid)
          AND (${friendshipId ?? null}::uuid IS NULL OR settlement."friendshipId" = ${friendshipId ?? null}::uuid)
      )
      SELECT COALESCE(SUM(CASE WHEN "creditorId" = ${creditorId}::uuid AND "debtorId" = ${debtorId}::uuid THEN "amountMinor" WHEN "creditorId" = ${debtorId}::uuid AND "debtorId" = ${creditorId}::uuid THEN -"amountMinor" ELSE 0 END), 0) AS net
      FROM current_entries
    `);
    return rows[0]?.net ?? 0n;
  }

  private present(row: {
    id: string;
    senderId: string;
    recipientId: string;
    groupId: string | null;
    friendshipId: string | null;
    currency: string;
    outstandingMinor: bigint;
    processedAmountMinor: bigint | null;
    scheduledFor: Date;
    status: string;
    outcomeCode: string | null;
    createdAt: Date;
  }) {
    return {
      ...row,
      outstandingMinor: row.outstandingMinor.toString(),
      processedAmountMinor: row.processedAmountMinor?.toString() ?? null,
    };
  }
  private async skip(id: string, outcomeCode: string, amount: bigint) {
    await this.prisma.reminder.update({
      where: { id },
      data: {
        status: "SKIPPED",
        outcomeCode,
        processedAt: new Date(),
        processedAmountMinor: amount,
      },
    });
  }
  private notAllowed() {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      "REMINDER_NOT_ALLOWED",
      "This reminder is not allowed",
    );
  }
}
