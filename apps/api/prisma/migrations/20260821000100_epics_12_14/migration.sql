BEGIN;

CREATE TYPE "BackgroundJobStatus" AS ENUM ('PENDING','RUNNING','SUCCEEDED','FAILED','DEAD','CANCELED');
CREATE TYPE "RecurringExpenseStatus" AS ENUM ('ACTIVE','PAUSED','COMPLETED','ARCHIVED');
CREATE TYPE "RecurrenceUnit" AS ENUM ('DAY','WEEK','MONTH','YEAR');
CREATE TYPE "RecurringOccurrenceStatus" AS ENUM ('PENDING','RUNNING','SUCCEEDED','FAILED','CANCELED');
CREATE TYPE "NotificationCategory" AS ENUM ('EXPENSE_ACTIVITY','INVITATIONS','REMINDERS','BUDGET_ALERTS');
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP','PUSH','EMAIL');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING','SENT','FAILED','SUPPRESSED');
CREATE TYPE "PushPlatform" AS ENUM ('WEB');
CREATE TYPE "ReminderStatus" AS ENUM ('SCHEDULED','COMPLETED','CANCELED','SKIPPED','FAILED');
CREATE TYPE "BudgetScope" AS ENUM ('PERSONAL','CATEGORY','GROUP');
CREATE TYPE "BudgetStatus" AS ENUM ('ACTIVE','ARCHIVED');

ALTER TABLE "User" ADD COLUMN "notifyBudgetAlerts" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "BackgroundJob" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "type" VARCHAR(80) NOT NULL,
  "payloadVersion" INTEGER NOT NULL DEFAULT 1, "payload" JSONB NOT NULL,
  "dedupeKey" VARCHAR(200) NOT NULL UNIQUE, "status" "BackgroundJobStatus" NOT NULL DEFAULT 'PENDING',
  "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5, "leaseOwner" VARCHAR(100), "leaseExpiresAt" TIMESTAMP(3),
  "lastErrorCode" VARCHAR(80), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BackgroundJob_attempts_check" CHECK ("attempts" >= 0 AND "maxAttempts" BETWEEN 1 AND 20)
);
CREATE INDEX "BackgroundJob_status_runAt_leaseExpiresAt_id_idx" ON "BackgroundJob"("status","runAt","leaseExpiresAt","id");
CREATE INDEX "BackgroundJob_type_status_runAt_idx" ON "BackgroundJob"("type","status","runAt");

CREATE TABLE "RecurringExpense" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "creatorId" UUID NOT NULL,
  "groupId" UUID, "friendshipId" UUID, "status" "RecurringExpenseStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1, "currentRevisionId" UUID UNIQUE, "nextRunAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "archivedAt" TIMESTAMP(3),
  "lastFailureCode" VARCHAR(80), "lastFailureAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecurringExpense_context_check" CHECK (("groupId" IS NOT NULL)::int + ("friendshipId" IS NOT NULL)::int = 1),
  CONSTRAINT "RecurringExpense_version_check" CHECK ("version" > 0)
);
CREATE TABLE "RecurringExpenseRevision" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "recurringExpenseId" UUID NOT NULL, "revision" INTEGER NOT NULL,
  "actorId" UUID NOT NULL, "description" VARCHAR(200) NOT NULL, "totalMinor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL, "notes" VARCHAR(2000), "splitMethod" "SplitMethod" NOT NULL,
  "categoryId" UUID, "recurrenceUnit" "RecurrenceUnit" NOT NULL, "recurrenceInterval" INTEGER NOT NULL,
  "weekdays" INTEGER[] NOT NULL DEFAULT '{}', "anchorDate" DATE NOT NULL, "localTime" CHAR(5) NOT NULL,
  "timezone" VARCHAR(100) NOT NULL, "endDate" DATE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecurringExpenseRevision_total_check" CHECK ("totalMinor" > 0),
  CONSTRAINT "RecurringExpenseRevision_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "RecurringExpenseRevision_interval_check" CHECK ("recurrenceInterval" BETWEEN 1 AND 365),
  CONSTRAINT "RecurringExpenseRevision_time_check" CHECK ("localTime" ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "RecurringExpenseRevision_end_check" CHECK ("endDate" IS NULL OR "endDate" >= "anchorDate"),
  UNIQUE ("recurringExpenseId","revision")
);
CREATE TABLE "RecurringExpensePayer" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "revisionId" UUID NOT NULL, "userId" UUID NOT NULL,
  "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0), UNIQUE ("revisionId","userId")
);
CREATE TABLE "RecurringExpenseSplit" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "revisionId" UUID NOT NULL, "userId" UUID NOT NULL,
  "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" >= 0), "inputValue" VARCHAR(40), UNIQUE ("revisionId","userId")
);
CREATE TABLE "RecurringOccurrence" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "recurringExpenseId" UUID NOT NULL, "revisionId" UUID NOT NULL,
  "occurrenceKey" VARCHAR(80) NOT NULL, "localDate" DATE NOT NULL, "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "RecurringOccurrenceStatus" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "expenseId" UUID UNIQUE, "lastErrorCode" VARCHAR(80), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, UNIQUE ("recurringExpenseId","occurrenceKey")
);
CREATE TABLE "RecurringExpenseIdempotency" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "actorId" UUID NOT NULL, "operation" VARCHAR(32) NOT NULL,
  "key" VARCHAR(128) NOT NULL, "requestHash" CHAR(64) NOT NULL, "recurringExpenseId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("actorId","operation","key")
);
CREATE INDEX "RecurringExpense_status_nextRunAt_id_idx" ON "RecurringExpense"("status","nextRunAt","id");
CREATE INDEX "RecurringExpense_creatorId_updatedAt_id_idx" ON "RecurringExpense"("creatorId","updatedAt","id");
CREATE INDEX "RecurringExpense_groupId_status_updatedAt_idx" ON "RecurringExpense"("groupId","status","updatedAt");
CREATE INDEX "RecurringExpense_friendshipId_status_updatedAt_idx" ON "RecurringExpense"("friendshipId","status","updatedAt");
CREATE INDEX "RecurringExpenseRevision_actorId_idx" ON "RecurringExpenseRevision"("actorId");
CREATE INDEX "RecurringExpenseRevision_categoryId_idx" ON "RecurringExpenseRevision"("categoryId");
CREATE INDEX "RecurringExpensePayer_userId_revisionId_idx" ON "RecurringExpensePayer"("userId","revisionId");
CREATE INDEX "RecurringExpenseSplit_userId_revisionId_idx" ON "RecurringExpenseSplit"("userId","revisionId");
CREATE INDEX "RecurringOccurrence_status_scheduledFor_id_idx" ON "RecurringOccurrence"("status","scheduledFor","id");
CREATE INDEX "RecurringOccurrence_recurringExpenseId_scheduledFor_id_idx" ON "RecurringOccurrence"("recurringExpenseId","scheduledFor","id");
CREATE INDEX "RecurringExpenseIdempotency_recurringExpenseId_idx" ON "RecurringExpenseIdempotency"("recurringExpenseId");

CREATE TABLE "Notification" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "recipientId" UUID NOT NULL, "actorId" UUID,
  "category" "NotificationCategory" NOT NULL, "type" VARCHAR(80) NOT NULL, "sourceType" VARCHAR(40) NOT NULL,
  "sourceId" VARCHAR(100) NOT NULL, "targetType" VARCHAR(40), "targetId" UUID,
  "dedupeKey" VARCHAR(200) NOT NULL, "payloadVersion" INTEGER NOT NULL DEFAULT 1, "payload" JSONB NOT NULL, "inAppVisible" BOOLEAN NOT NULL DEFAULT true,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("recipientId","dedupeKey")
);
CREATE TABLE "NotificationChannelPreference" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "category" "NotificationCategory" NOT NULL,
  "channel" "NotificationChannel" NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("userId","category","channel")
);
CREATE TABLE "PushDevice" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "sessionId" UUID NOT NULL,
  "platform" "PushPlatform" NOT NULL DEFAULT 'WEB', "tokenCiphertext" TEXT NOT NULL,
  "tokenFingerprint" CHAR(64) NOT NULL UNIQUE, "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "NotificationDelivery" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "notificationId" UUID NOT NULL,
  "channel" "NotificationChannel" NOT NULL, "deviceId" UUID, "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "providerMessageId" VARCHAR(200), "lastErrorCode" VARCHAR(80), "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("notificationId","channel","deviceId")
);
CREATE UNIQUE INDEX "NotificationDelivery_single_destination_key" ON "NotificationDelivery"("notificationId","channel") WHERE "deviceId" IS NULL;
CREATE INDEX "Notification_recipientId_readAt_occurredAt_id_idx" ON "Notification"("recipientId","readAt","occurredAt","id");
CREATE INDEX "Notification_sourceType_sourceId_idx" ON "Notification"("sourceType","sourceId");
CREATE INDEX "NotificationChannelPreference_userId_category_idx" ON "NotificationChannelPreference"("userId","category");
CREATE INDEX "PushDevice_userId_retiredAt_lastSeenAt_idx" ON "PushDevice"("userId","retiredAt","lastSeenAt");
CREATE INDEX "PushDevice_sessionId_retiredAt_idx" ON "PushDevice"("sessionId","retiredAt");
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_id_idx" ON "NotificationDelivery"("status","nextAttemptAt","id");

CREATE TABLE "Reminder" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "senderId" UUID NOT NULL, "recipientId" UUID NOT NULL,
  "groupId" UUID, "friendshipId" UUID, "currency" CHAR(3) NOT NULL, "outstandingMinor" BIGINT NOT NULL,
  "processedAmountMinor" BIGINT, "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "ReminderStatus" NOT NULL DEFAULT 'SCHEDULED', "outcomeCode" VARCHAR(80),
  "processedAt" TIMESTAMP(3), "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Reminder_context_check" CHECK (("groupId" IS NOT NULL)::int + ("friendshipId" IS NOT NULL)::int = 1),
  CONSTRAINT "Reminder_participants_check" CHECK ("senderId" <> "recipientId"),
  CONSTRAINT "Reminder_money_check" CHECK ("outstandingMinor" > 0 AND "currency" ~ '^[A-Z]{3}$')
);
CREATE INDEX "Reminder_senderId_createdAt_id_idx" ON "Reminder"("senderId","createdAt","id");
CREATE INDEX "Reminder_recipientId_createdAt_id_idx" ON "Reminder"("recipientId","createdAt","id");
CREATE INDEX "Reminder_status_scheduledFor_id_idx" ON "Reminder"("status","scheduledFor","id");
CREATE UNIQUE INDEX "Reminder_one_pending_group_key" ON "Reminder"("senderId","recipientId","groupId","currency") WHERE "status" = 'SCHEDULED' AND "groupId" IS NOT NULL;
CREATE UNIQUE INDEX "Reminder_one_pending_friendship_key" ON "Reminder"("senderId","recipientId","friendshipId","currency") WHERE "status" = 'SCHEDULED' AND "friendshipId" IS NOT NULL;

CREATE TABLE "Budget" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "creatorId" UUID NOT NULL, "ownerId" UUID,
  "groupId" UUID, "categoryId" UUID, "scope" "BudgetScope" NOT NULL, "currency" CHAR(3) NOT NULL,
  "amountMinor" BIGINT NOT NULL, "startMonth" DATE NOT NULL, "endMonth" DATE,
  "status" "BudgetStatus" NOT NULL DEFAULT 'ACTIVE', "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "archivedAt" TIMESTAMP(3),
  CONSTRAINT "Budget_scope_check" CHECK (
    ("scope"='PERSONAL' AND "ownerId" IS NOT NULL AND "groupId" IS NULL AND "categoryId" IS NULL) OR
    ("scope"='CATEGORY' AND "ownerId" IS NOT NULL AND "groupId" IS NULL AND "categoryId" IS NOT NULL) OR
    ("scope"='GROUP' AND "ownerId" IS NULL AND "groupId" IS NOT NULL AND "categoryId" IS NULL)
  ),
  CONSTRAINT "Budget_money_check" CHECK ("amountMinor" > 0 AND "currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "Budget_month_check" CHECK ("startMonth" = date_trunc('month',"startMonth")::date AND ("endMonth" IS NULL OR ("endMonth" = date_trunc('month',"endMonth")::date AND "endMonth" >= "startMonth")))
);
CREATE TABLE "BudgetThresholdEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "budgetId" UUID NOT NULL, "month" DATE NOT NULL,
  "thresholdPercent" INTEGER NOT NULL, "observedSpendMinor" BIGINT NOT NULL, "notificationId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BudgetThresholdEvent_threshold_check" CHECK ("thresholdPercent" IN (80,100)),
  UNIQUE ("budgetId","month","thresholdPercent")
);
CREATE INDEX "Budget_ownerId_status_currency_idx" ON "Budget"("ownerId","status","currency");
CREATE INDEX "Budget_groupId_status_currency_idx" ON "Budget"("groupId","status","currency");
CREATE INDEX "Budget_categoryId_status_currency_idx" ON "Budget"("categoryId","status","currency");
CREATE UNIQUE INDEX "Budget_active_personal_key" ON "Budget"("ownerId","currency") WHERE "status"='ACTIVE' AND "scope"='PERSONAL';
CREATE UNIQUE INDEX "Budget_active_category_key" ON "Budget"("ownerId","categoryId","currency") WHERE "status"='ACTIVE' AND "scope"='CATEGORY';
CREATE UNIQUE INDEX "Budget_active_group_key" ON "Budget"("groupId","currency") WHERE "status"='ACTIVE' AND "scope"='GROUP';
CREATE INDEX "BudgetThresholdEvent_month_createdAt_idx" ON "BudgetThresholdEvent"("month","createdAt");
CREATE INDEX "ExpenseRevision_currency_expenseDate_id_idx" ON "ExpenseRevision"("currency","expenseDate","id");

ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_friendshipId_fkey" FOREIGN KEY ("friendshipId") REFERENCES "Friendship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringExpenseRevision" ADD CONSTRAINT "RecurringExpenseRevision_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringExpenseRevision" ADD CONSTRAINT "RecurringExpenseRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringExpensePayer" ADD CONSTRAINT "RecurringExpensePayer_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "RecurringExpenseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringExpensePayer" ADD CONSTRAINT "RecurringExpensePayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringExpenseSplit" ADD CONSTRAINT "RecurringExpenseSplit_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "RecurringExpenseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringExpenseSplit" ADD CONSTRAINT "RecurringExpenseSplit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringOccurrence" ADD CONSTRAINT "RecurringOccurrence_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringOccurrence" ADD CONSTRAINT "RecurringOccurrence_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "RecurringExpenseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringOccurrence" ADD CONSTRAINT "RecurringOccurrence_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "RecurringExpenseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringExpenseIdempotency" ADD CONSTRAINT "RecurringExpenseIdempotency_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringExpenseIdempotency" ADD CONSTRAINT "RecurringExpenseIdempotency_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationChannelPreference" ADD CONSTRAINT "NotificationChannelPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PushDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_friendshipId_fkey" FOREIGN KEY ("friendshipId") REFERENCES "Friendship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetThresholdEvent" ADD CONSTRAINT "BudgetThresholdEvent_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
