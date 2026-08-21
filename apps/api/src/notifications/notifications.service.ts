import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import {
  HttpStatus,
  Inject,
  Injectable,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "../generated/prisma/client";
import type {
  NotificationCategory,
  NotificationChannel,
} from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import type { Environment } from "../config/environment";
import { ApiException } from "../http/api.exception";
import { JobsService, PermanentJobError } from "../jobs/jobs.service";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import type { RecordActivityInput } from "../activities/activities.service";
import type {
  NotificationPageQueryDto,
  UpdateChannelPreferencesDto,
} from "./notifications.dto";
import { FcmPushAdapter, ResendEmailAdapter } from "./delivery.adapters";
import { friendEmailToken, groupEmailToken } from "./invitation-email";

type Database = PrismaService | Prisma.TransactionClient;
const categories: NotificationCategory[] = [
  "EXPENSE_ACTIVITY",
  "INVITATIONS",
  "REMINDERS",
  "BUDGET_ALERTS",
];
const channels: NotificationChannel[] = ["IN_APP", "PUSH", "EMAIL"];

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly push: FcmPushAdapter;
  private readonly email: ResendEmailAdapter;
  private readonly key: Buffer;
  private readonly invitationSecret: string;
  private readonly webAppUrl: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(ConfigService) config: ConfigService<Environment, true>,
  ) {
    const projectId = config.get("FCM_PROJECT_ID", { infer: true });
    const clientEmail = config.get("FCM_CLIENT_EMAIL", { infer: true });
    const privateKey = config.get("FCM_PRIVATE_KEY", { infer: true });
    this.push = new FcmPushAdapter(
      projectId && clientEmail && privateKey
        ? { projectId, clientEmail, privateKey }
        : undefined,
    );
    this.email = new ResendEmailAdapter(
      config.get("RESEND_API_KEY", { infer: true }),
      config.get("EMAIL_FROM", { infer: true }),
    );
    this.key = createHash("sha256")
      .update(config.get("PUSH_TOKEN_SECRET", { infer: true }))
      .digest();
    this.invitationSecret = config.get("FRIEND_INVITE_SECRET", { infer: true });
    this.webAppUrl = config.get("WEB_APP_URL", { infer: true });
  }

  onModuleInit(): void {
    this.jobs.register("NOTIFICATION_DELIVERY", async (payload) => {
      if (typeof payload.deliveryId !== "string")
        throw new PermanentJobError("INVALID_JOB_PAYLOAD");
      await this.deliver(payload.deliveryId);
    });
    this.jobs.register("INVITATION_EMAIL", async (payload) =>
      this.deliverInvitation(payload),
    );
  }

  async projectActivity(
    database: Database,
    eventId: string,
    input: RecordActivityInput,
  ): Promise<void> {
    if (!input.actorId) return;
    if (input.type === "COMMENT_UPDATED" || input.type === "COMMENT_DELETED")
      return;
    const category: NotificationCategory = input.type.startsWith("GROUP_")
      ? "INVITATIONS"
      : "EXPENSE_ACTIVITY";
    const target = this.activityTarget(input);
    for (const recipientId of [...new Set(input.audienceUserIds)].filter(
      (id) => id !== input.actorId,
    )) {
      await this.create(database, {
        recipientId,
        actorId: input.actorId,
        category,
        type: input.type,
        sourceType: "ACTIVITY",
        sourceId: eventId,
        dedupeKey: `activity:${eventId}`,
        targetType: target.type,
        targetId: target.id,
        payload: input.payload ?? {},
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      });
    }
  }

  async create(
    database: Database,
    input: {
      recipientId: string;
      actorId?: string;
      category: NotificationCategory;
      type: string;
      sourceType: string;
      sourceId: string;
      dedupeKey: string;
      targetType?: string;
      targetId?: string;
      payload?: Prisma.InputJsonObject;
      occurredAt?: Date;
    },
  ) {
    const user = await database.user.findUnique({
      where: { id: input.recipientId },
    });
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !this.masterEnabled(user, input.category)
    )
      return null;
    const preferences = await database.notificationChannelPreference.findMany({
      where: { userId: input.recipientId, category: input.category },
    });
    const inAppVisible = this.enabled(input.category, "IN_APP", preferences);
    const pushEnabled = this.enabled(input.category, "PUSH", preferences);
    const emailEnabled = this.enabled(input.category, "EMAIL", preferences);
    if (!inAppVisible && !pushEnabled && !emailEnabled) return null;
    const notification = await database.notification.upsert({
      where: {
        recipientId_dedupeKey: {
          recipientId: input.recipientId,
          dedupeKey: input.dedupeKey,
        },
      },
      create: {
        recipientId: input.recipientId,
        actorId: input.actorId ?? null,
        category: input.category,
        type: input.type,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        dedupeKey: input.dedupeKey,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        payload: input.payload ?? {},
        inAppVisible,
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      },
      update: {},
    });
    if (pushEnabled) {
      const devices = await database.pushDevice.findMany({
        where: { userId: input.recipientId, retiredAt: null },
      });
      for (const device of devices)
        await this.createDelivery(database, notification.id, "PUSH", device.id);
    }
    if (user.email && emailEnabled)
      await this.createDelivery(database, notification.id, "EMAIL");
    return notification;
  }

  async list(userId: string, query: NotificationPageQueryDto) {
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const rows = await this.prisma.notification.findMany({
      where: {
        recipientId: userId,
        inAppVisible: true,
        ...(query.unreadOnly ? { readAt: null } : {}),
        ...(cursor
          ? {
              OR: [
                { occurredAt: { lt: cursor.occurredAt } },
                { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const items = await Promise.all(
      rows.slice(0, query.limit).map(async (row) => ({
        id: row.id,
        category: row.category,
        type: row.type,
        actor: row.actor,
        payload: row.payload,
        occurredAt: row.occurredAt,
        readAt: row.readAt,
        target: await this.authorizedTarget(
          userId,
          row.targetType,
          row.targetId,
        ),
      })),
    );
    const last = rows.length > query.limit ? rows[query.limit - 1] : undefined;
    return {
      items,
      nextCursor: last ? this.encodeCursor(last.occurredAt, last.id) : null,
    };
  }

  unreadCount(userId: string) {
    return this.prisma.notification
      .count({
        where: { recipientId: userId, inAppVisible: true, readAt: null },
      })
      .then((count) => ({ count }));
  }

  async markRead(userId: string, id: string) {
    const changed = await this.prisma.notification.updateMany({
      where: { id, recipientId: userId, inAppVisible: true },
      data: { readAt: new Date() },
    });
    if (!changed.count)
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "NOTIFICATION_NOT_FOUND",
        "Notification was not found",
      );
    return { id, read: true };
  }

  async readAll(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: userId, inAppVisible: true, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async preferences(userId: string) {
    const saved = await this.prisma.notificationChannelPreference.findMany({
      where: { userId },
    });
    return {
      preferences: categories.flatMap((category) =>
        channels.map((channel) => ({
          category,
          channel,
          enabled: this.enabled(category, channel, saved),
        })),
      ),
    };
  }

  async updatePreferences(userId: string, input: UpdateChannelPreferencesDto) {
    await this.prisma.withTransaction(async (database) => {
      for (const preference of input.preferences) {
        await database.notificationChannelPreference.upsert({
          where: {
            userId_category_channel: {
              userId,
              category: preference.category,
              channel: preference.channel,
            },
          },
          create: {
            userId,
            category: preference.category,
            channel: preference.channel,
            enabled: preference.enabled,
          },
          update: { enabled: preference.enabled },
        });
      }
    });
    return this.preferences(userId);
  }

  async registerDevice(principal: AuthenticatedPrincipal, token: string) {
    const fingerprint = createHmac("sha256", this.key)
      .update(token)
      .digest("hex");
    const encrypted = this.encrypt(token);
    const row = await this.prisma.pushDevice.upsert({
      where: { tokenFingerprint: fingerprint },
      create: {
        userId: principal.userId,
        sessionId: principal.sessionId,
        tokenCiphertext: encrypted,
        tokenFingerprint: fingerprint,
      },
      update: {
        userId: principal.userId,
        sessionId: principal.sessionId,
        tokenCiphertext: encrypted,
        retiredAt: null,
        lastSeenAt: new Date(),
      },
    });
    return { id: row.id, platform: row.platform, lastSeenAt: row.lastSeenAt };
  }

  async queueInvitationEmail(
    database: Database,
    input: { email: string; kind: "FRIEND" | "GROUP"; invitationId: string },
  ) {
    await this.jobs.enqueue(database, {
      type: "INVITATION_EMAIL",
      dedupeKey: `invitation-email:${input.kind}:${input.invitationId}:${createHash("sha256").update(input.email.toLowerCase()).digest("hex")}`,
      payload: {
        email: input.email.toLowerCase(),
        kind: input.kind,
        invitationId: input.invitationId,
      },
    });
  }

  async retireDevice(userId: string, id: string) {
    const changed = await this.prisma.pushDevice.updateMany({
      where: { id, userId, retiredAt: null },
      data: { retiredAt: new Date() },
    });
    if (!changed.count)
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "PUSH_REGISTRATION_INVALID",
        "Push device was not found",
      );
    return { id, retired: true };
  }

  private async createDelivery(
    database: Database,
    notificationId: string,
    channel: "PUSH" | "EMAIL",
    deviceId?: string,
  ) {
    const existing = await database.notificationDelivery.findFirst({
      where: { notificationId, channel, deviceId: deviceId ?? null },
    });
    const delivery =
      existing ??
      (await database.notificationDelivery.create({
        data: { notificationId, channel, deviceId: deviceId ?? null },
      }));
    await this.jobs.enqueue(database, {
      type: "NOTIFICATION_DELIVERY",
      dedupeKey: `notification-delivery:${delivery.id}`,
      payload: { deliveryId: delivery.id },
    });
  }

  private async deliver(id: string): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id },
      include: { notification: { include: { recipient: true } }, device: true },
    });
    if (
      !delivery ||
      delivery.status === "SENT" ||
      delivery.status === "SUPPRESSED"
    )
      return;
    let result;
    if (delivery.channel === "PUSH" && delivery.device)
      result = await this.push.send(
        this.decrypt(delivery.device.tokenCiphertext),
        delivery.notificationId,
      );
    else if (
      delivery.channel === "EMAIL" &&
      delivery.notification.recipient.email
    ) {
      const copy = this.emailCopy(delivery.notification.category);
      result = await this.email.send(
        delivery.notification.recipient.email,
        copy.subject,
        copy.text,
        copy.html,
      );
    } else throw new PermanentJobError("DELIVERY_DESTINATION_MISSING");
    if (result.status === "SENT") {
      await this.prisma.notificationDelivery.update({
        where: { id },
        data: {
          status: "SENT",
          attempts: { increment: 1 },
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          lastErrorCode: null,
        },
      });
      return;
    }
    if (result.status === "INVALID") {
      await this.prisma.withTransaction(async (database) => {
        await database.notificationDelivery.update({
          where: { id },
          data: {
            status: "SUPPRESSED",
            attempts: { increment: 1 },
            lastErrorCode: result.code,
          },
        });
        if (delivery.deviceId)
          await database.pushDevice.update({
            where: { id: delivery.deviceId },
            data: { retiredAt: new Date() },
          });
      });
      return;
    }
    await this.prisma.notificationDelivery.update({
      where: { id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        lastErrorCode: result.code,
      },
    });
    throw new Error(result.code);
  }

  private async deliverInvitation(payload: Prisma.JsonObject): Promise<void> {
    if (
      typeof payload.email !== "string" ||
      typeof payload.kind !== "string" ||
      typeof payload.invitationId !== "string"
    )
      throw new PermanentJobError("INVALID_JOB_PAYLOAD");
    let url: string;
    if (payload.kind === "FRIEND") {
      const invitation = await this.prisma.friendInvitation.findUnique({
        where: { id: payload.invitationId },
      });
      if (
        !invitation ||
        invitation.revokedAt ||
        invitation.consumedAt ||
        invitation.expiresAt <= new Date()
      )
        throw new PermanentJobError("INVITATION_UNAVAILABLE");
      url = new URL(
        `/invite/${friendEmailToken(this.invitationSecret, invitation.id, invitation.expiresAt)}`,
        this.webAppUrl,
      ).toString();
    } else if (payload.kind === "GROUP") {
      const invitation = await this.prisma.groupInvitation.findUnique({
        where: { id: payload.invitationId },
      });
      if (
        !invitation ||
        invitation.revokedAt ||
        invitation.expiresAt <= new Date()
      )
        throw new PermanentJobError("INVITATION_UNAVAILABLE");
      url = new URL(
        `/group-invite/${groupEmailToken(this.invitationSecret, invitation.id, invitation.expiresAt)}`,
        this.webAppUrl,
      ).toString();
    } else throw new PermanentJobError("INVALID_JOB_PAYLOAD");
    const text = `You were invited to SplitFinPulse. Open this secure invitation: ${url}`;
    const result = await this.email.send(
      payload.email,
      "Your SplitFinPulse invitation",
      text,
      `<p>You were invited to SplitFinPulse.</p><p><a href="${url}">Accept invitation</a></p>`,
    );
    if (result.status === "SENT") return;
    if (result.status === "INVALID") throw new PermanentJobError(result.code);
    throw new Error(result.code);
  }

  private enabled(
    category: NotificationCategory,
    channel: NotificationChannel,
    saved: Array<{
      category: NotificationCategory;
      channel: NotificationChannel;
      enabled: boolean;
    }>,
  ): boolean {
    const row = saved.find(
      (item) => item.category === category && item.channel === channel,
    );
    if (row) return row.enabled;
    if (channel === "IN_APP" || channel === "PUSH") return true;
    return category === "INVITATIONS" || category === "REMINDERS";
  }

  private masterEnabled(
    user: {
      notifyExpenseActivity: boolean;
      notifyInvitations: boolean;
      notifyReminders: boolean;
      notifyBudgetAlerts: boolean;
    },
    category: NotificationCategory,
  ): boolean {
    if (category === "EXPENSE_ACTIVITY") return user.notifyExpenseActivity;
    if (category === "INVITATIONS") return user.notifyInvitations;
    if (category === "REMINDERS") return user.notifyReminders;
    return user.notifyBudgetAlerts;
  }

  private activityTarget(input: RecordActivityInput): {
    type: string;
    id: string;
  } {
    if (input.entityType === "COMMENT") {
      const expenseId = input.payload?.expenseId;
      if (typeof expenseId === "string")
        return { type: "EXPENSE", id: expenseId };
    }
    if (input.entityType === "GROUP_MEMBER" && input.groupId)
      return { type: "GROUP", id: input.groupId };
    return { type: input.entityType, id: input.entityId };
  }

  private async authorizedTarget(
    userId: string,
    type: string | null,
    id: string | null,
  ): Promise<{ type: string; id: string } | null> {
    if (!type || !id) return null;
    if (type === "EXPENSE") {
      const row = await this.prisma.expense.findFirst({
        where: {
          id,
          OR: [
            {
              friendship: {
                OR: [{ firstUserId: userId }, { secondUserId: userId }],
              },
            },
            { group: { memberships: { some: { userId, leftAt: null } } } },
            {
              revisions: {
                some: {
                  OR: [
                    { payers: { some: { userId } } },
                    { splits: { some: { userId } } },
                  ],
                },
              },
            },
          ],
        },
        select: { id: true },
      });
      return row ? { type, id } : null;
    }
    if (type === "GROUP" || type === "GROUP_BALANCE") {
      const row = await this.prisma.groupMember.findFirst({
        where: { groupId: id, userId, leftAt: null },
        select: { id: true },
      });
      return row ? { type, id } : null;
    }
    if (type === "FRIEND_BALANCE") {
      const row = await this.prisma.friendship.findFirst({
        where: {
          id,
          status: "ACCEPTED",
          OR: [{ firstUserId: userId }, { secondUserId: userId }],
        },
        select: { id: true },
      });
      return row ? { type, id } : null;
    }
    if (type === "SETTLEMENT") {
      const row = await this.prisma.settlement.findFirst({
        where: {
          id,
          revisions: {
            some: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
          },
        },
        select: { id: true },
      });
      return row ? { type, id } : null;
    }
    if (type === "BUDGET") {
      const row = await this.prisma.budget.findFirst({
        where: {
          id,
          OR: [
            { ownerId: userId },
            { group: { memberships: { some: { userId, leftAt: null } } } },
          ],
        },
        select: { id: true },
      });
      return row ? { type, id } : null;
    }
    return null;
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
  }
  private decrypt(value: string): string {
    const [iv, tag, body] = value.split(".");
    if (!iv || !tag || !body) throw new PermanentJobError("PUSH_TOKEN_INVALID");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
  private emailCopy(category: NotificationCategory) {
    const label =
      category === "REMINDERS"
        ? "payment reminder"
        : category === "INVITATIONS"
          ? "invitation"
          : category === "BUDGET_ALERTS"
            ? "budget update"
            : "shared expense update";
    const text = `You have a new ${label} in SplitFinPulse. Sign in to view it securely.`;
    const href = new URL("/notifications", this.webAppUrl).toString();
    return {
      subject: `SplitFinPulse ${label}`,
      text,
      html: `<p>${text}</p><p><a href="${href}">Open SplitFinPulse</a></p>`,
    };
  }
  private encodeCursor(occurredAt: Date, id: string) {
    return Buffer.from(
      JSON.stringify({ occurredAt: occurredAt.toISOString(), id }),
    ).toString("base64url");
  }
  private decodeCursor(value: string): { occurredAt: Date; id: string } {
    try {
      const raw = JSON.parse(
        Buffer.from(value, "base64url").toString("utf8"),
      ) as { occurredAt: string; id: string };
      const occurredAt = new Date(raw.occurredAt);
      if (Number.isNaN(occurredAt.getTime()) || !raw.id) throw new Error();
      return { occurredAt, id: raw.id };
    } catch {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_CURSOR",
        "Invalid cursor",
      );
    }
  }
}
