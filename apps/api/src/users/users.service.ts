import { createHmac } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../http/api.exception";
import {
  AuditService,
  auditActions,
  personalSecurityActions,
} from "../audit/audit.service";
import { presentSession, presentUser } from "../auth/auth.presenter";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import type { UpdateProfileDto } from "./user.dto";
import {
  isSupportedCurrencyCode,
  listCurrencyMetadata,
} from "../currencies/currency-codes";

const supportedLocales = ["en-US", "en-GB", "th-TH", "ur-PK", "hi-IN"];

@Injectable()
export class UsersService {
  private readonly timezones = new Set(Intl.supportedValuesOf("timeZone"));

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw this.authRequired();
    return presentUser(user);
  }

  async update(userId: string, input: UpdateProfileDto, requestId?: string) {
    if (
      input.defaultCurrency &&
      !isSupportedCurrencyCode(input.defaultCurrency)
    ) {
      throw this.invalidPreference("Unsupported currency code");
    }
    if (input.timezone && !this.timezones.has(input.timezone)) {
      throw this.invalidPreference("Unsupported timezone");
    }
    let locale = input.locale;
    if (locale) {
      try {
        [locale] = Intl.getCanonicalLocales(locale);
      } catch {
        throw this.invalidPreference("Unsupported locale");
      }
      if (!locale || !supportedLocales.includes(locale)) {
        throw this.invalidPreference("Unsupported locale");
      }
    }
    const user = await this.prisma.withTransaction(async (database) => {
      const existing = await database.user.findUnique({
        where: { id: userId },
      });
      if (!existing || existing.status !== "ACTIVE") throw this.authRequired();
      const updated = await database.user.update({
        where: { id: userId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.avatarVisible !== undefined
            ? {
                avatarUrl: input.avatarVisible
                  ? existing.providerAvatarUrl
                  : null,
              }
            : {}),
          ...(input.defaultCurrency
            ? { defaultCurrency: input.defaultCurrency }
            : {}),
          ...(input.timezone ? { timezone: input.timezone } : {}),
          ...(locale ? { locale } : {}),
          ...(input.notificationPreferences
            ? {
                notifyExpenseActivity:
                  input.notificationPreferences.expenseActivity,
                notifyReminders: input.notificationPreferences.reminders,
                notifyInvitations: input.notificationPreferences.invitations,
              }
            : {}),
        },
      });
      await this.audit.record(database, {
        actorId: userId,
        action: auditActions.profileUpdated,
        targetType: "USER",
        targetId: userId,
        ...(requestId ? { requestId } : {}),
      });
      return updated;
    });
    return presentUser(user);
  }

  preferenceOptions() {
    const display = new Intl.DisplayNames(["en"], { type: "currency" });
    return {
      currencies: listCurrencyMetadata().map((item) => ({
        ...item,
        name: display.of(item.code) ?? item.name,
      })),
      timezones: [...this.timezones],
      locales: supportedLocales.map((code) => ({
        code,
        name: new Intl.DisplayNames([code], { type: "language" }).of(
          code.split("-")[0] ?? code,
        ),
      })),
    };
  }

  async exportAccount(principal: AuthenticatedPrincipal, requestId?: string) {
    await this.requireRecentAuthentication(principal.sessionId);
    await this.prisma.withTransaction(async (database) => {
      await database.accountLifecycleEvent.create({
        data: { userId: principal.userId, type: "DATA_EXPORTED" },
      });
      await this.audit.record(database, {
        actorId: principal.userId,
        sessionId: principal.sessionId,
        action: auditActions.accountDataExported,
        targetType: "USER",
        targetId: principal.userId,
        ...(requestId ? { requestId } : {}),
      });
    });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: principal.userId },
      include: {
        identities: true,
        sessions: { orderBy: { createdAt: "desc" } },
        lifecycleEvents: { orderBy: { createdAt: "asc" } },
        friendshipsAsFirst: { orderBy: { createdAt: "asc" } },
        friendshipsAsSecond: { orderBy: { createdAt: "asc" } },
        invitationsCreated: { orderBy: { createdAt: "asc" } },
        invitationsAccepted: { orderBy: { createdAt: "asc" } },
        groupMemberships: {
          include: { group: true },
          orderBy: { joinedAt: "asc" },
        },
        groupInvitations: { orderBy: { createdAt: "asc" } },
        expenseComments: { orderBy: { createdAt: "asc" } },
        activityAudience: {
          include: { event: true },
          orderBy: { createdAt: "asc" },
        },
        auditEvents: {
          where: { action: { in: [...personalSecurityActions] } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const expenses = await this.prisma.expense.findMany({
      where: {
        OR: [
          { creatorId: principal.userId },
          {
            revisions: {
              some: {
                OR: [
                  { payers: { some: { userId: principal.userId } } },
                  { splits: { some: { userId: principal.userId } } },
                ],
              },
            },
          },
        ],
      },
      include: {
        attachments: { include: { extraction: true } },
        revisions: {
          include: {
            payers: true,
            splits: true,
            ledgerEntries: true,
            exchangeRateSet: { include: { quotes: true } },
          },
          orderBy: { revision: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const settlements = await this.prisma.settlement.findMany({
      where: {
        OR: [
          { creatorId: principal.userId },
          {
            revisions: {
              some: {
                OR: [
                  { actorId: principal.userId },
                  { fromUserId: principal.userId },
                  { toUserId: principal.userId },
                ],
              },
            },
          },
        ],
      },
      include: {
        revisions: {
          include: {
            ledgerEntries: true,
            allocations: true,
            exchangeRateSet: { include: { quotes: true } },
          },
          orderBy: { revision: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const categories = await this.prisma.category.findMany({
      where: { ownerId: principal.userId },
      orderBy: { createdAt: "asc" },
    });
    return {
      schemaVersion: 4,
      generatedAt: new Date().toISOString(),
      profile: presentUser(user),
      identities: user.identities.map((identity) => ({
        provider: identity.provider,
        email: identity.providerEmail,
        createdAt: identity.createdAt,
      })),
      sessions: user.sessions.map((session) =>
        presentSession(session, principal.sessionId),
      ),
      lifecycleEvents: user.lifecycleEvents.map((event) => ({
        type: event.type,
        createdAt: event.createdAt,
      })),
      friendships: [
        ...user.friendshipsAsFirst,
        ...user.friendshipsAsSecond,
      ].map((friendship) => ({
        id: friendship.id,
        firstUserId: friendship.firstUserId,
        secondUserId: friendship.secondUserId,
        requestedById: friendship.requestedById,
        status: friendship.status,
        createdAt: friendship.createdAt,
        updatedAt: friendship.updatedAt,
      })),
      friendInvitations: {
        created: user.invitationsCreated.map((invitation) => ({
          id: invitation.id,
          expiresAt: invitation.expiresAt,
          consumedAt: invitation.consumedAt,
          revokedAt: invitation.revokedAt,
          acceptedById: invitation.acceptedById,
          createdAt: invitation.createdAt,
        })),
        accepted: user.invitationsAccepted.map((invitation) => ({
          id: invitation.id,
          inviterId: invitation.inviterId,
          consumedAt: invitation.consumedAt,
        })),
      },
      groups: user.groupMemberships.map((membership) => ({
        membershipId: membership.id,
        group: {
          id: membership.group.id,
          name: membership.group.name,
          type: membership.group.type,
          status: membership.group.status,
          defaultCurrency: membership.group.defaultCurrency,
          simplifyDebtsEnabled: membership.group.simplifyDebtsEnabled,
          createdAt: membership.group.createdAt,
          archivedAt: membership.group.archivedAt,
        },
        role: membership.role,
        joinedAt: membership.joinedAt,
        leftAt: membership.leftAt,
      })),
      groupInvitationsCreated: user.groupInvitations.map((invitation) => ({
        id: invitation.id,
        groupId: invitation.groupId,
        expiresAt: invitation.expiresAt,
        revokedAt: invitation.revokedAt,
        createdAt: invitation.createdAt,
      })),
      categories: categories.map((category) => ({
        id: category.id,
        key: category.key,
        name: category.name,
        icon: category.icon,
        archivedAt: category.archivedAt,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      })),
      expenses: expenses.map((expense) => ({
        id: expense.id,
        creatorId: expense.creatorId,
        groupId: expense.groupId,
        friendshipId: expense.friendshipId,
        status: expense.status,
        version: expense.version,
        currentRevisionId: expense.currentRevisionId,
        createdAt: expense.createdAt,
        updatedAt: expense.updatedAt,
        deletedAt: expense.deletedAt,
        revisions: expense.revisions.map((revision) => ({
          id: revision.id,
          revision: revision.revision,
          action: revision.action,
          actorId: revision.actorId,
          description: revision.description,
          totalMinor: revision.totalMinor.toString(),
          currency: revision.currency,
          expenseDate: revision.expenseDate,
          notes: revision.notes,
          splitMethod: revision.splitMethod,
          category: revision.categoryName
            ? {
                id: revision.categoryId,
                name: revision.categoryName,
                icon: revision.categoryIcon,
              }
            : null,
          valuation: this.exportValuation(revision.exchangeRateSet),
          createdAt: revision.createdAt,
          payers: revision.payers.map((payer) => ({
            userId: payer.userId,
            amountMinor: payer.amountMinor.toString(),
          })),
          splits: revision.splits.map((split) => ({
            userId: split.userId,
            amountMinor: split.amountMinor.toString(),
            inputValue: split.inputValue,
          })),
          ledgerEntries: revision.ledgerEntries.map((entry) => ({
            sequence: entry.sequence,
            debtorId: entry.debtorId,
            creditorId: entry.creditorId,
            amountMinor: entry.amountMinor.toString(),
            currency: entry.currency,
          })),
        })),
        attachments: expense.attachments.map((attachment) => ({
          id: attachment.id,
          originalName: attachment.originalName,
          detectedMime: attachment.detectedMime,
          sizeBytes: attachment.sizeBytes,
          sha256: attachment.sha256,
          status: attachment.status,
          scanStatus: attachment.scanStatus,
          createdAt: attachment.createdAt,
          deletedAt: attachment.deletedAt,
          extraction: attachment.extraction
            ? {
                status: attachment.extraction.status,
                merchant: attachment.extraction.merchant,
                expenseDate: attachment.extraction.expenseDate,
                totalText: attachment.extraction.totalText,
                currencyHint: attachment.extraction.currencyHint,
                confidence: attachment.extraction.confidence,
                errorCode: attachment.extraction.errorCode,
              }
            : null,
        })),
      })),
      settlements: settlements.map((settlement) => ({
        id: settlement.id,
        creatorId: settlement.creatorId,
        groupId: settlement.groupId,
        friendshipId: settlement.friendshipId,
        status: settlement.status,
        version: settlement.version,
        currentRevisionId: settlement.currentRevisionId,
        replacesSettlementId: settlement.replacesSettlementId,
        createdAt: settlement.createdAt,
        updatedAt: settlement.updatedAt,
        reversedAt: settlement.reversedAt,
        revisions: settlement.revisions.map((revision) => ({
          id: revision.id,
          revision: revision.revision,
          action: revision.action,
          actorId: revision.actorId,
          fromUserId: revision.fromUserId,
          toUserId: revision.toUserId,
          amountMinor: revision.amountMinor.toString(),
          currency: revision.currency,
          method: revision.method,
          methodLabel: revision.methodLabel,
          settledOn: revision.settledOn,
          note: revision.note,
          reversalReason: revision.reversalReason,
          valuation: this.exportValuation(revision.exchangeRateSet),
          allocations: revision.allocations.map((allocation) => ({
            expenseId: allocation.expenseId,
            pathSequence: allocation.pathSequence,
            edgeSequence: allocation.edgeSequence,
            debtorId: allocation.debtorId,
            creditorId: allocation.creditorId,
            amountMinor: allocation.amountMinor.toString(),
            currency: allocation.currency,
          })),
          createdAt: revision.createdAt,
          ledgerEntries: revision.ledgerEntries.map((entry) => ({
            sequence: entry.sequence,
            debtorId: entry.debtorId,
            creditorId: entry.creditorId,
            amountMinor: entry.amountMinor.toString(),
            currency: entry.currency,
          })),
        })),
      })),
      comments: user.expenseComments.map((comment) => ({
        id: comment.id,
        expenseId: comment.expenseId,
        body: comment.deletedAt ? null : comment.body,
        version: comment.version,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        deletedAt: comment.deletedAt,
      })),
      activity: user.activityAudience.map(({ event }) => ({
        id: event.id,
        type: event.type,
        actorId: event.actorId,
        entityType: event.entityType,
        entityId: event.entityId,
        groupId: event.groupId,
        friendshipId: event.friendshipId,
        payloadVersion: event.payloadVersion,
        payload: event.payload,
        occurredAt: event.occurredAt,
      })),
      auditEvents: user.auditEvents.map((event) => ({
        id: event.id,
        action: event.action,
        outcome: event.outcome,
        requestId: event.requestId,
        createdAt: event.createdAt,
      })),
    };
  }

  private exportValuation(
    rateSet: {
      baseCurrency: string;
      status: string;
      source: string;
      effectiveDate: Date;
      capturedAt: Date;
      payloadHash: string | null;
      quotes: Array<{
        quoteCurrency: string;
        numerator: string;
        denominator: string;
      }>;
    } | null,
  ) {
    return rateSet
      ? {
          baseCurrency: rateSet.baseCurrency,
          status: rateSet.status,
          source: rateSet.source,
          effectiveDate: rateSet.effectiveDate,
          capturedAt: rateSet.capturedAt,
          payloadHash: rateSet.payloadHash,
          quotes: rateSet.quotes,
        }
      : null;
  }

  async deactivate(
    principal: AuthenticatedPrincipal,
    requestId?: string,
  ): Promise<void> {
    await this.prisma.withTransaction(async (database) => {
      await database.user.update({
        where: { id: principal.userId },
        data: { status: "DEACTIVATED", deactivatedAt: new Date() },
      });
      await database.authSession.updateMany({
        where: { userId: principal.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "ACCOUNT_DEACTIVATED" },
      });
      await database.accountLifecycleEvent.create({
        data: { userId: principal.userId, type: "DEACTIVATED" },
      });
      await this.audit.record(database, {
        actorId: principal.userId,
        sessionId: principal.sessionId,
        action: auditActions.accountDeactivated,
        targetType: "USER",
        targetId: principal.userId,
        ...(requestId ? { requestId } : {}),
      });
    });
  }

  async delete(
    principal: AuthenticatedPrincipal,
    requestId?: string,
  ): Promise<void> {
    await this.requireRecentAuthentication(principal.sessionId);
    await this.prisma.withTransaction(async (database) => {
      const now = new Date();
      const ownedGroup = await database.groupMember.findFirst({
        where: {
          userId: principal.userId,
          role: "OWNER",
          leftAt: null,
        },
        select: { groupId: true },
      });
      if (ownedGroup) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "GROUP_OWNERSHIP_TRANSFER_REQUIRED",
          "Transfer or delete owned groups before deleting your account",
        );
      }
      const identities = await database.authIdentity.findMany({
        where: { userId: principal.userId },
      });
      if (identities.length > 0) {
        await database.deletedAuthIdentity.createMany({
          data: identities.map((identity) => ({
            userId: principal.userId,
            provider: identity.provider,
            subjectHash: createHmac(
              "sha256",
              this.config.get("OIDC_TRANSACTION_SECRET", { infer: true }),
            )
              .update(`${identity.provider}:${identity.providerSubject}`)
              .digest("hex"),
          })),
        });
      }
      await database.authSession.updateMany({
        where: { userId: principal.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "ACCOUNT_DELETED" },
      });
      await database.friendship.updateMany({
        where: {
          status: { in: ["PENDING", "ACCEPTED"] },
          OR: [
            { firstUserId: principal.userId },
            { secondUserId: principal.userId },
          ],
        },
        data: { status: "REMOVED", removedAt: now },
      });
      await database.friendInvitation.updateMany({
        where: {
          inviterId: principal.userId,
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      await database.groupInvitation.updateMany({
        where: { createdById: principal.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await database.groupMember.updateMany({
        where: { userId: principal.userId, leftAt: null },
        data: { leftAt: now },
      });
      await database.expenseComment.updateMany({
        where: { authorId: principal.userId, deletedAt: null },
        data: { body: null, deletedAt: now, version: { increment: 1 } },
      });
      await database.authIdentity.deleteMany({
        where: { userId: principal.userId },
      });
      await database.user.update({
        where: { id: principal.userId },
        data: {
          email: null,
          name: "Deleted user",
          avatarUrl: null,
          providerAvatarUrl: null,
          defaultCurrency: "USD",
          timezone: "UTC",
          locale: "en-US",
          notifyExpenseActivity: false,
          notifyReminders: false,
          notifyInvitations: false,
          status: "DELETED",
          deactivatedAt: null,
          deletedAt: now,
        },
      });
      await database.accountLifecycleEvent.create({
        data: { userId: principal.userId, type: "DELETED" },
      });
      await this.audit.record(database, {
        actorId: principal.userId,
        sessionId: principal.sessionId,
        action: auditActions.accountDeleted,
        targetType: "USER",
        targetId: principal.userId,
        ...(requestId ? { requestId } : {}),
      });
    });
  }

  private async requireRecentAuthentication(sessionId: string): Promise<void> {
    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
    });
    if (
      !session ||
      session.reauthenticatedAt < new Date(Date.now() - 5 * 60_000)
    ) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "REAUTH_REQUIRED",
        "Please sign in with Google again to continue",
      );
    }
  }

  private invalidPreference(message: string): ApiException {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      "INVALID_PREFERENCE",
      message,
    );
  }

  private authRequired(): ApiException {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      "AUTH_REQUIRED",
      "Authentication is required",
    );
  }
}
