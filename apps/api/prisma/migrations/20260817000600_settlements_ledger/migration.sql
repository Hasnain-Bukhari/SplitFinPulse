CREATE TYPE "LedgerSourceType" AS ENUM ('EXPENSE_REVISION', 'SETTLEMENT_REVISION');
CREATE TYPE "SettlementStatus" AS ENUM ('ACTIVE', 'REVERSED');
CREATE TYPE "SettlementRevisionAction" AS ENUM ('CREATED', 'REPLACED', 'REVERSED');
CREATE TYPE "SettlementMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER');

ALTER TABLE "LedgerEntry" ADD COLUMN "sourceType" "LedgerSourceType";
ALTER TABLE "LedgerEntry" ADD COLUMN "settlementRevisionId" UUID;
UPDATE "LedgerEntry" SET "sourceType" = 'EXPENSE_REVISION';
ALTER TABLE "LedgerEntry" ALTER COLUMN "sourceType" SET NOT NULL;
ALTER TABLE "LedgerEntry" ALTER COLUMN "revisionId" DROP NOT NULL;
DROP INDEX "LedgerEntry_revisionId_sequence_key";
CREATE UNIQUE INDEX "LedgerEntry_revisionId_sequence_key" ON "LedgerEntry"("revisionId", "sequence");
CREATE UNIQUE INDEX "LedgerEntry_settlementRevisionId_sequence_key" ON "LedgerEntry"("settlementRevisionId", "sequence");
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_source_check" CHECK (
  ("sourceType" = 'EXPENSE_REVISION' AND "revisionId" IS NOT NULL AND "settlementRevisionId" IS NULL)
  OR ("sourceType" = 'SETTLEMENT_REVISION' AND "revisionId" IS NULL AND "settlementRevisionId" IS NOT NULL)
);

CREATE TABLE "Settlement" (
  "id" UUID NOT NULL,
  "creatorId" UUID NOT NULL,
  "groupId" UUID,
  "friendshipId" UUID,
  "status" "SettlementStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "currentRevisionId" UUID,
  "replacesSettlementId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "reversedAt" TIMESTAMP(3),
  CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Settlement_context_check" CHECK (("groupId" IS NOT NULL)::int + ("friendshipId" IS NOT NULL)::int = 1),
  CONSTRAINT "Settlement_version_check" CHECK ("version" > 0),
  CONSTRAINT "Settlement_reversed_state_check" CHECK (("status" = 'REVERSED') = ("reversedAt" IS NOT NULL))
);

CREATE TABLE "SettlementRevision" (
  "id" UUID NOT NULL,
  "settlementId" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "action" "SettlementRevisionAction" NOT NULL,
  "actorId" UUID NOT NULL,
  "fromUserId" UUID NOT NULL,
  "toUserId" UUID NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "method" "SettlementMethod" NOT NULL,
  "methodLabel" VARCHAR(80),
  "settledOn" DATE NOT NULL,
  "note" VARCHAR(2000),
  "reversalReason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SettlementRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SettlementRevision_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "SettlementRevision_amount_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "SettlementRevision_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "SettlementRevision_users_check" CHECK ("fromUserId" <> "toUserId"),
  CONSTRAINT "SettlementRevision_reversal_check" CHECK (("action" = 'REVERSED') = ("reversalReason" IS NOT NULL)),
  CONSTRAINT "SettlementRevision_method_label_check" CHECK ("methodLabel" IS NULL OR "method" = 'OTHER')
);

CREATE TABLE "SettlementIdempotency" (
  "id" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "operation" VARCHAR(32) NOT NULL,
  "key" VARCHAR(128) NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "settlementId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SettlementIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Settlement_currentRevisionId_key" ON "Settlement"("currentRevisionId");
CREATE UNIQUE INDEX "Settlement_replacesSettlementId_key" ON "Settlement"("replacesSettlementId");
CREATE INDEX "Settlement_groupId_status_updatedAt_id_idx" ON "Settlement"("groupId", "status", "updatedAt", "id");
CREATE INDEX "Settlement_friendshipId_status_updatedAt_id_idx" ON "Settlement"("friendshipId", "status", "updatedAt", "id");
CREATE INDEX "Settlement_creatorId_updatedAt_id_idx" ON "Settlement"("creatorId", "updatedAt", "id");
CREATE UNIQUE INDEX "SettlementRevision_settlementId_revision_key" ON "SettlementRevision"("settlementId", "revision");
CREATE INDEX "SettlementRevision_settlementId_createdAt_id_idx" ON "SettlementRevision"("settlementId", "createdAt", "id");
CREATE INDEX "SettlementRevision_fromUserId_currency_idx" ON "SettlementRevision"("fromUserId", "currency");
CREATE INDEX "SettlementRevision_toUserId_currency_idx" ON "SettlementRevision"("toUserId", "currency");
CREATE UNIQUE INDEX "SettlementIdempotency_actorId_operation_key_key" ON "SettlementIdempotency"("actorId", "operation", "key");
CREATE INDEX "SettlementIdempotency_settlementId_idx" ON "SettlementIdempotency"("settlementId");

ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_friendshipId_fkey" FOREIGN KEY ("friendshipId") REFERENCES "Friendship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_replacesSettlementId_fkey" FOREIGN KEY ("replacesSettlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementRevision" ADD CONSTRAINT "SettlementRevision_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementRevision" ADD CONSTRAINT "SettlementRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementRevision" ADD CONSTRAINT "SettlementRevision_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementRevision" ADD CONSTRAINT "SettlementRevision_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "SettlementRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_settlementRevisionId_fkey" FOREIGN KEY ("settlementRevisionId") REFERENCES "SettlementRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementIdempotency" ADD CONSTRAINT "SettlementIdempotency_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementIdempotency" ADD CONSTRAINT "SettlementIdempotency_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION check_expense_revision_conservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_id UUID; expected BIGINT; payer_total BIGINT; split_total BIGINT; revision_currency CHAR(3);
BEGIN
  IF TG_TABLE_NAME = 'LedgerEntry' THEN
    IF NEW."sourceType" = 'SETTLEMENT_REVISION' THEN RETURN NULL; END IF;
  END IF;
  revision_id := COALESCE(NEW."revisionId", OLD."revisionId");
  SELECT "totalMinor", "currency" INTO expected, revision_currency FROM "ExpenseRevision" WHERE "id" = revision_id;
  SELECT COALESCE(SUM("amountMinor"), 0) INTO payer_total FROM "ExpensePayer" WHERE "revisionId" = revision_id;
  SELECT COALESCE(SUM("amountMinor"), 0) INTO split_total FROM "ExpenseSplit" WHERE "revisionId" = revision_id;
  IF payer_total <> expected OR split_total <> expected THEN RAISE EXCEPTION 'expense allocation conservation violation' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM "LedgerEntry" WHERE "revisionId" = revision_id AND "currency" <> revision_currency) THEN RAISE EXCEPTION 'ledger currency mismatch' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION check_ledger_allocation_net() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status "ExpenseStatus";
BEGIN
  IF NEW."sourceType" = 'SETTLEMENT_REVISION' THEN RETURN NULL; END IF;
  SELECT e."status" INTO current_status FROM "Expense" e WHERE e."currentRevisionId" = NEW."revisionId";
  IF current_status IS NULL OR NOT financial_revision_ledger_is_valid(NEW."revisionId", current_status) THEN
    RAISE EXCEPTION 'ledger does not reproduce allocation positions' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "SettlementRevision_immutable" BEFORE UPDATE OR DELETE ON "SettlementRevision" FOR EACH ROW EXECUTE FUNCTION prevent_financial_history_mutation();

CREATE FUNCTION check_settlement_current_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_row RECORD; ledger_count BIGINT;
BEGIN
  SELECT s."currentRevisionId", s."version", s."status", r."settlementId", r."revision", r."action",
         r."fromUserId", r."toUserId", r."amountMinor", r."currency"
    INTO current_row
    FROM "Settlement" s
    LEFT JOIN "SettlementRevision" r ON r."id" = s."currentRevisionId"
    WHERE s."id" = NEW."id";
  SELECT COUNT(*) INTO ledger_count FROM "LedgerEntry" WHERE "settlementRevisionId" = current_row."currentRevisionId";
  IF current_row."currentRevisionId" IS NULL
     OR current_row."settlementId" IS DISTINCT FROM NEW."id"
     OR current_row."revision" IS DISTINCT FROM current_row."version"
     OR (current_row."status" = 'REVERSED') IS DISTINCT FROM (current_row."action" = 'REVERSED')
     OR (current_row."status" = 'ACTIVE' AND (
       ledger_count <> 1 OR NOT EXISTS (
         SELECT 1 FROM "LedgerEntry" le
         WHERE le."settlementRevisionId" = current_row."currentRevisionId"
           AND le."sourceType" = 'SETTLEMENT_REVISION'
           AND le."debtorId" = current_row."toUserId"
           AND le."creditorId" = current_row."fromUserId"
           AND le."amountMinor" = current_row."amountMinor"
           AND le."currency" = current_row."currency"
       )
     ))
     OR (current_row."status" = 'REVERSED' AND ledger_count <> 0) THEN
    RAISE EXCEPTION 'invalid current settlement revision' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "Settlement_current_revision_guard"
AFTER INSERT OR UPDATE ON "Settlement"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_settlement_current_revision();
