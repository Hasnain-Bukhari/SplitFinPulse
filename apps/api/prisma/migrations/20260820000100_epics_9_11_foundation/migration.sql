BEGIN;

CREATE TYPE "CategoryKind" AS ENUM ('SYSTEM', 'USER');
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'AVAILABLE', 'REJECTED', 'DELETED');
CREATE TYPE "AttachmentScanStatus" AS ENUM ('PENDING', 'NOT_CONFIGURED', 'CLEAN', 'REJECTED');
CREATE TYPE "ReceiptExtractionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'NO_DATA', 'FAILED', 'UNSUPPORTED');
CREATE TYPE "ExchangeRateSetStatus" AS ENUM ('AVAILABLE', 'MANUAL', 'UNAVAILABLE');

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "Category" (
  "id" UUID NOT NULL,
  "kind" "CategoryKind" NOT NULL,
  "ownerId" UUID,
  "key" VARCHAR(50) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "icon" VARCHAR(40) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Category_owner_kind_check" CHECK (("kind" = 'SYSTEM' AND "ownerId" IS NULL) OR ("kind" = 'USER' AND "ownerId" IS NOT NULL))
);

CREATE TABLE "SettlementAllocation" (
  "id" UUID NOT NULL,
  "settlementRevisionId" UUID NOT NULL,
  "expenseId" UUID NOT NULL,
  "pathSequence" INTEGER NOT NULL,
  "edgeSequence" INTEGER NOT NULL,
  "debtorId" UUID NOT NULL,
  "creditorId" UUID NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SettlementAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SettlementAllocation_amount_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "SettlementAllocation_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "SettlementAllocation_users_check" CHECK ("debtorId" <> "creditorId")
);

CREATE TABLE "Attachment" (
  "id" UUID NOT NULL,
  "expenseId" UUID,
  "uploaderId" UUID NOT NULL,
  "originalName" VARCHAR(255) NOT NULL,
  "storageKey" VARCHAR(100),
  "declaredMime" VARCHAR(100) NOT NULL,
  "detectedMime" VARCHAR(100),
  "sizeBytes" INTEGER,
  "sha256" CHAR(64),
  "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
  "scanStatus" "AttachmentScanStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Attachment_size_check" CHECK ("sizeBytes" IS NULL OR "sizeBytes" > 0)
);

CREATE TABLE "AttachmentUploadIntent" (
  "id" UUID NOT NULL,
  "attachmentId" UUID NOT NULL,
  "uploaderId" UUID NOT NULL,
  "tokenDigest" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttachmentUploadIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReceiptExtraction" (
  "id" UUID NOT NULL,
  "attachmentId" UUID NOT NULL,
  "status" "ReceiptExtractionStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseOwner" VARCHAR(100),
  "leaseExpiresAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "merchant" VARCHAR(200),
  "expenseDate" DATE,
  "totalText" VARCHAR(80),
  "currencyHint" CHAR(3),
  "confidence" VARCHAR(20),
  "errorCode" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReceiptExtraction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReceiptExtraction_attempts_check" CHECK ("attempts" BETWEEN 0 AND 3),
  CONSTRAINT "ReceiptExtraction_currency_check" CHECK ("currencyHint" IS NULL OR "currencyHint" ~ '^[A-Z]{3}$')
);

CREATE TABLE "ExchangeRateSet" (
  "id" UUID NOT NULL,
  "baseCurrency" CHAR(3) NOT NULL,
  "status" "ExchangeRateSetStatus" NOT NULL,
  "source" VARCHAR(80) NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payloadHash" CHAR(64),
  "createdById" UUID,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "ExchangeRateSet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExchangeRateSet_currency_check" CHECK ("baseCurrency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "ExchangeRateQuote" (
  "id" UUID NOT NULL,
  "rateSetId" UUID NOT NULL,
  "quoteCurrency" CHAR(3) NOT NULL,
  "numerator" VARCHAR(80) NOT NULL,
  "denominator" VARCHAR(80) NOT NULL,
  CONSTRAINT "ExchangeRateQuote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExchangeRateQuote_currency_check" CHECK ("quoteCurrency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "ExchangeRateQuote_rational_check" CHECK ("numerator" ~ '^[1-9][0-9]*$' AND "denominator" ~ '^[1-9][0-9]*$')
);

ALTER TABLE "ExpenseRevision"
  ADD COLUMN "categoryId" UUID,
  ADD COLUMN "categoryName" VARCHAR(80),
  ADD COLUMN "categoryIcon" VARCHAR(40),
  ADD COLUMN "exchangeRateSetId" UUID;

ALTER TABLE "SettlementRevision" ADD COLUMN "exchangeRateSetId" UUID;

CREATE UNIQUE INDEX "Category_ownerId_key_key" ON "Category"("ownerId", "key");
CREATE UNIQUE INDEX "Category_system_key_unique" ON "Category"("key") WHERE "ownerId" IS NULL;
CREATE UNIQUE INDEX "Category_user_active_name_unique" ON "Category"("ownerId", lower("name")) WHERE "archivedAt" IS NULL AND "ownerId" IS NOT NULL;
CREATE INDEX "Category_kind_archivedAt_name_idx" ON "Category"("kind", "archivedAt", "name");
CREATE INDEX "Category_name_trgm_idx" ON "Category" USING GIN (lower("name") gin_trgm_ops);
CREATE INDEX "ExpenseRevision_search_idx" ON "ExpenseRevision" USING GIN (to_tsvector('simple', "description"));
CREATE INDEX "ExpenseRevision_categoryId_expenseDate_idx" ON "ExpenseRevision"("categoryId", "expenseDate");
CREATE INDEX "ExpenseRevision_exchangeRateSetId_idx" ON "ExpenseRevision"("exchangeRateSetId");
CREATE INDEX "Group_name_trgm_idx" ON "Group" USING GIN (lower("name") gin_trgm_ops);
CREATE INDEX "User_name_trgm_idx" ON "User" USING GIN (lower("name") gin_trgm_ops);
CREATE UNIQUE INDEX "SettlementAllocation_settlementRevisionId_pathSequence_edgeSequence_key" ON "SettlementAllocation"("settlementRevisionId", "pathSequence", "edgeSequence");
CREATE INDEX "SettlementAllocation_expenseId_currency_idx" ON "SettlementAllocation"("expenseId", "currency");
CREATE INDEX "SettlementAllocation_settlementRevisionId_idx" ON "SettlementAllocation"("settlementRevisionId");
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");
CREATE INDEX "Attachment_expenseId_status_createdAt_idx" ON "Attachment"("expenseId", "status", "createdAt");
CREATE INDEX "Attachment_uploaderId_expenseId_createdAt_idx" ON "Attachment"("uploaderId", "expenseId", "createdAt");
CREATE UNIQUE INDEX "AttachmentUploadIntent_attachmentId_key" ON "AttachmentUploadIntent"("attachmentId");
CREATE UNIQUE INDEX "AttachmentUploadIntent_tokenDigest_key" ON "AttachmentUploadIntent"("tokenDigest");
CREATE INDEX "AttachmentUploadIntent_expiresAt_idx" ON "AttachmentUploadIntent"("expiresAt");
CREATE INDEX "AttachmentUploadIntent_uploaderId_createdAt_idx" ON "AttachmentUploadIntent"("uploaderId", "createdAt");
CREATE UNIQUE INDEX "ReceiptExtraction_attachmentId_key" ON "ReceiptExtraction"("attachmentId");
CREATE INDEX "ReceiptExtraction_status_nextAttemptAt_leaseExpiresAt_idx" ON "ReceiptExtraction"("status", "nextAttemptAt", "leaseExpiresAt");
CREATE INDEX "ExchangeRateSet_baseCurrency_effectiveDate_capturedAt_idx" ON "ExchangeRateSet"("baseCurrency", "effectiveDate", "capturedAt");
CREATE INDEX "ExchangeRateSet_createdById_expiresAt_idx" ON "ExchangeRateSet"("createdById", "expiresAt");
CREATE UNIQUE INDEX "ExchangeRateQuote_rateSetId_quoteCurrency_key" ON "ExchangeRateQuote"("rateSetId", "quoteCurrency");
CREATE INDEX "ExchangeRateQuote_quoteCurrency_idx" ON "ExchangeRateQuote"("quoteCurrency");
CREATE INDEX "SettlementRevision_exchangeRateSetId_idx" ON "SettlementRevision"("exchangeRateSetId");

ALTER TABLE "Category" ADD CONSTRAINT "Category_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRevision" ADD CONSTRAINT "ExpenseRevision_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementAllocation" ADD CONSTRAINT "SettlementAllocation_settlementRevisionId_fkey" FOREIGN KEY ("settlementRevisionId") REFERENCES "SettlementRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementAllocation" ADD CONSTRAINT "SettlementAllocation_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttachmentUploadIntent" ADD CONSTRAINT "AttachmentUploadIntent_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttachmentUploadIntent" ADD CONSTRAINT "AttachmentUploadIntent_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceiptExtraction" ADD CONSTRAINT "ReceiptExtraction_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExchangeRateSet" ADD CONSTRAINT "ExchangeRateSet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExchangeRateQuote" ADD CONSTRAINT "ExchangeRateQuote_rateSetId_fkey" FOREIGN KEY ("rateSetId") REFERENCES "ExchangeRateSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRevision" ADD CONSTRAINT "ExpenseRevision_exchangeRateSetId_fkey" FOREIGN KEY ("exchangeRateSetId") REFERENCES "ExchangeRateSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementRevision" ADD CONSTRAINT "SettlementRevision_exchangeRateSetId_fkey" FOREIGN KEY ("exchangeRateSetId") REFERENCES "ExchangeRateSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Category" ("id", "kind", "key", "name", "icon", "updatedAt") VALUES
  ('10000000-0000-4000-8000-000000000001', 'SYSTEM', 'food', 'Food & dining', 'utensils', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000002', 'SYSTEM', 'transport', 'Transport', 'car', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000003', 'SYSTEM', 'housing', 'Housing', 'house', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000004', 'SYSTEM', 'utilities', 'Utilities', 'zap', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000005', 'SYSTEM', 'shopping', 'Shopping', 'shopping-bag', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000006', 'SYSTEM', 'entertainment', 'Entertainment', 'ticket', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000007', 'SYSTEM', 'travel', 'Travel', 'plane', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000008', 'SYSTEM', 'other', 'Other', 'tag', CURRENT_TIMESTAMP);

COMMIT;
