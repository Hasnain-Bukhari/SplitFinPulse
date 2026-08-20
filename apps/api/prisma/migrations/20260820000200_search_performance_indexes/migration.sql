BEGIN;

CREATE INDEX IF NOT EXISTS "ExpenseRevision_description_trgm_idx"
  ON "ExpenseRevision" USING GIN ("description" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Group_name_plain_trgm_idx"
  ON "Group" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "User_name_plain_trgm_idx"
  ON "User" USING GIN ("name" gin_trgm_ops);

ALTER TABLE "ExpenseRevision" DISABLE TRIGGER USER;
ALTER TABLE "SettlementRevision" DISABLE TRIGGER USER;

INSERT INTO "ExchangeRateSet" (
  "id", "baseCurrency", "status", "source", "effectiveDate", "createdById"
)
SELECT
  md5('legacy-expense:' || revision."id"::text)::uuid,
  revision."currency",
  'UNAVAILABLE'::"ExchangeRateSetStatus",
  'LEGACY_UNAVAILABLE',
  revision."expenseDate",
  revision."actorId"
FROM "ExpenseRevision" revision
WHERE revision."exchangeRateSetId" IS NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ExchangeRateQuote" (
  "id", "rateSetId", "quoteCurrency", "numerator", "denominator"
)
SELECT
  md5('legacy-expense-quote:' || revision."id"::text)::uuid,
  md5('legacy-expense:' || revision."id"::text)::uuid,
  revision."currency",
  '1',
  '1'
FROM "ExpenseRevision" revision
WHERE revision."exchangeRateSetId" IS NULL
ON CONFLICT ("rateSetId", "quoteCurrency") DO NOTHING;

UPDATE "ExpenseRevision"
SET "exchangeRateSetId" = md5('legacy-expense:' || "id"::text)::uuid
WHERE "exchangeRateSetId" IS NULL;

INSERT INTO "ExchangeRateSet" (
  "id", "baseCurrency", "status", "source", "effectiveDate", "createdById"
)
SELECT
  md5('legacy-settlement:' || revision."id"::text)::uuid,
  revision."currency",
  'UNAVAILABLE'::"ExchangeRateSetStatus",
  'LEGACY_UNAVAILABLE',
  revision."settledOn",
  revision."actorId"
FROM "SettlementRevision" revision
WHERE revision."exchangeRateSetId" IS NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ExchangeRateQuote" (
  "id", "rateSetId", "quoteCurrency", "numerator", "denominator"
)
SELECT
  md5('legacy-settlement-quote:' || revision."id"::text)::uuid,
  md5('legacy-settlement:' || revision."id"::text)::uuid,
  revision."currency",
  '1',
  '1'
FROM "SettlementRevision" revision
WHERE revision."exchangeRateSetId" IS NULL
ON CONFLICT ("rateSetId", "quoteCurrency") DO NOTHING;

UPDATE "SettlementRevision"
SET "exchangeRateSetId" = md5('legacy-settlement:' || "id"::text)::uuid
WHERE "exchangeRateSetId" IS NULL;

ALTER TABLE "SettlementRevision" ENABLE TRIGGER USER;
ALTER TABLE "ExpenseRevision" ENABLE TRIGGER USER;

COMMIT;
