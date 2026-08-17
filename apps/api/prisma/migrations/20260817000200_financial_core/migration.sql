CREATE TYPE "ExpenseStatus" AS ENUM ('ACTIVE', 'DELETED');
CREATE TYPE "ExpenseRevisionAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'RESTORED');
CREATE TYPE "SplitMethod" AS ENUM ('EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES');

CREATE TABLE "Expense" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "creatorId" UUID NOT NULL,
  "groupId" UUID, "friendshipId" UUID, "status" "ExpenseStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1, "currentRevisionId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Expense_context_check" CHECK (("groupId" IS NOT NULL)::int + ("friendshipId" IS NOT NULL)::int = 1),
  CONSTRAINT "Expense_version_check" CHECK ("version" > 0),
  CONSTRAINT "Expense_deleted_state_check" CHECK (("status" = 'DELETED') = ("deletedAt" IS NOT NULL))
);

CREATE TABLE "ExpenseRevision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "expenseId" UUID NOT NULL,
  "revision" INTEGER NOT NULL, "action" "ExpenseRevisionAction" NOT NULL, "actorId" UUID NOT NULL,
  "description" VARCHAR(200) NOT NULL, "totalMinor" BIGINT NOT NULL, "currency" CHAR(3) NOT NULL,
  "expenseDate" DATE NOT NULL, "notes" VARCHAR(2000), "splitMethod" "SplitMethod" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseRevision_total_check" CHECK ("totalMinor" > 0),
  CONSTRAINT "ExpenseRevision_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "ExpenseRevision_revision_check" CHECK ("revision" > 0)
);

CREATE TABLE "ExpensePayer" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "revisionId" UUID NOT NULL,
  "userId" UUID NOT NULL, "amountMinor" BIGINT NOT NULL,
  CONSTRAINT "ExpensePayer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpensePayer_amount_check" CHECK ("amountMinor" > 0)
);
CREATE TABLE "ExpenseSplit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "revisionId" UUID NOT NULL,
  "userId" UUID NOT NULL, "amountMinor" BIGINT NOT NULL, "inputValue" VARCHAR(40),
  CONSTRAINT "ExpenseSplit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseSplit_amount_check" CHECK ("amountMinor" > 0)
);
CREATE TABLE "LedgerEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "revisionId" UUID NOT NULL, "sequence" INTEGER NOT NULL,
  "debtorId" UUID NOT NULL, "creditorId" UUID NOT NULL, "amountMinor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LedgerEntry_amount_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "LedgerEntry_users_check" CHECK ("debtorId" <> "creditorId"),
  CONSTRAINT "LedgerEntry_sequence_check" CHECK ("sequence" >= 0),
  CONSTRAINT "LedgerEntry_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE TABLE "ExpenseIdempotency" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "actorId" UUID NOT NULL, "operation" VARCHAR(32) NOT NULL,
  "key" VARCHAR(128) NOT NULL, "requestHash" CHAR(64) NOT NULL, "expenseId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Expense_currentRevisionId_key" ON "Expense"("currentRevisionId");
CREATE INDEX "Expense_groupId_status_updatedAt_id_idx" ON "Expense"("groupId", "status", "updatedAt", "id");
CREATE INDEX "Expense_friendshipId_status_updatedAt_id_idx" ON "Expense"("friendshipId", "status", "updatedAt", "id");
CREATE INDEX "Expense_creatorId_updatedAt_id_idx" ON "Expense"("creatorId", "updatedAt", "id");
CREATE UNIQUE INDEX "ExpenseRevision_expenseId_revision_key" ON "ExpenseRevision"("expenseId", "revision");
CREATE INDEX "ExpenseRevision_expenseId_createdAt_id_idx" ON "ExpenseRevision"("expenseId", "createdAt", "id");
CREATE INDEX "ExpenseRevision_actorId_idx" ON "ExpenseRevision"("actorId");
CREATE UNIQUE INDEX "ExpensePayer_revisionId_userId_key" ON "ExpensePayer"("revisionId", "userId");
CREATE INDEX "ExpensePayer_userId_revisionId_idx" ON "ExpensePayer"("userId", "revisionId");
CREATE UNIQUE INDEX "ExpenseSplit_revisionId_userId_key" ON "ExpenseSplit"("revisionId", "userId");
CREATE INDEX "ExpenseSplit_userId_revisionId_idx" ON "ExpenseSplit"("userId", "revisionId");
CREATE UNIQUE INDEX "LedgerEntry_revisionId_sequence_key" ON "LedgerEntry"("revisionId", "sequence");
CREATE INDEX "LedgerEntry_debtorId_currency_idx" ON "LedgerEntry"("debtorId", "currency");
CREATE INDEX "LedgerEntry_creditorId_currency_idx" ON "LedgerEntry"("creditorId", "currency");
CREATE UNIQUE INDEX "ExpenseIdempotency_actorId_operation_key_key" ON "ExpenseIdempotency"("actorId", "operation", "key");
CREATE INDEX "ExpenseIdempotency_expenseId_idx" ON "ExpenseIdempotency"("expenseId");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_friendshipId_fkey" FOREIGN KEY ("friendshipId") REFERENCES "Friendship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRevision" ADD CONSTRAINT "ExpenseRevision_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRevision" ADD CONSTRAINT "ExpenseRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "ExpenseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpensePayer" ADD CONSTRAINT "ExpensePayer_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ExpenseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpensePayer" ADD CONSTRAINT "ExpensePayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseSplit" ADD CONSTRAINT "ExpenseSplit_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ExpenseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseSplit" ADD CONSTRAINT "ExpenseSplit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ExpenseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_creditorId_fkey" FOREIGN KEY ("creditorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseIdempotency" ADD CONSTRAINT "ExpenseIdempotency_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseIdempotency" ADD CONSTRAINT "ExpenseIdempotency_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION check_expense_revision_conservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_id UUID; expected BIGINT; payer_total BIGINT; split_total BIGINT; revision_currency CHAR(3);
BEGIN
  revision_id := COALESCE(NEW."revisionId", OLD."revisionId");
  SELECT "totalMinor", "currency" INTO expected, revision_currency FROM "ExpenseRevision" WHERE "id" = revision_id;
  SELECT COALESCE(SUM("amountMinor"), 0) INTO payer_total FROM "ExpensePayer" WHERE "revisionId" = revision_id;
  SELECT COALESCE(SUM("amountMinor"), 0) INTO split_total FROM "ExpenseSplit" WHERE "revisionId" = revision_id;
  IF payer_total <> expected OR split_total <> expected THEN RAISE EXCEPTION 'expense allocation conservation violation' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM "LedgerEntry" WHERE "revisionId" = revision_id AND "currency" <> revision_currency) THEN RAISE EXCEPTION 'ledger currency mismatch' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "ExpensePayer_conservation" AFTER INSERT OR UPDATE OR DELETE ON "ExpensePayer" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_expense_revision_conservation();
CREATE CONSTRAINT TRIGGER "ExpenseSplit_conservation" AFTER INSERT OR UPDATE OR DELETE ON "ExpenseSplit" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_expense_revision_conservation();
CREATE CONSTRAINT TRIGGER "LedgerEntry_currency" AFTER INSERT OR UPDATE ON "LedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_expense_revision_conservation();

CREATE FUNCTION prevent_financial_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'financial history is immutable' USING ERRCODE = '55000'; END $$;
CREATE TRIGGER "ExpenseRevision_immutable" BEFORE UPDATE OR DELETE ON "ExpenseRevision" FOR EACH ROW EXECUTE FUNCTION prevent_financial_history_mutation();
CREATE TRIGGER "ExpensePayer_immutable" BEFORE UPDATE OR DELETE ON "ExpensePayer" FOR EACH ROW EXECUTE FUNCTION prevent_financial_history_mutation();
CREATE TRIGGER "ExpenseSplit_immutable" BEFORE UPDATE OR DELETE ON "ExpenseSplit" FOR EACH ROW EXECUTE FUNCTION prevent_financial_history_mutation();
CREATE TRIGGER "LedgerEntry_immutable" BEFORE UPDATE OR DELETE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION prevent_financial_history_mutation();
