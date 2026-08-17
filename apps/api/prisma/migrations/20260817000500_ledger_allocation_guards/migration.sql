CREATE FUNCTION financial_revision_ledger_is_valid(target_revision UUID, target_status "ExpenseStatus")
RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF target_status = 'DELETED' THEN
    RETURN NOT EXISTS (SELECT 1 FROM "LedgerEntry" WHERE "revisionId" = target_revision);
  END IF;

  RETURN NOT EXISTS (
    WITH involved AS (
      SELECT "userId" FROM "ExpensePayer" WHERE "revisionId" = target_revision
      UNION
      SELECT "userId" FROM "ExpenseSplit" WHERE "revisionId" = target_revision
      UNION
      SELECT "debtorId" FROM "LedgerEntry" WHERE "revisionId" = target_revision
      UNION
      SELECT "creditorId" FROM "LedgerEntry" WHERE "revisionId" = target_revision
    ), positions AS (
      SELECT involved."userId",
        COALESCE((SELECT SUM("amountMinor") FROM "ExpensePayer" WHERE "revisionId" = target_revision AND "userId" = involved."userId"), 0)
        - COALESCE((SELECT SUM("amountMinor") FROM "ExpenseSplit" WHERE "revisionId" = target_revision AND "userId" = involved."userId"), 0) AS allocation_net,
        COALESCE((SELECT SUM("amountMinor") FROM "LedgerEntry" WHERE "revisionId" = target_revision AND "creditorId" = involved."userId"), 0)
        - COALESCE((SELECT SUM("amountMinor") FROM "LedgerEntry" WHERE "revisionId" = target_revision AND "debtorId" = involved."userId"), 0) AS ledger_net
      FROM involved
    )
    SELECT 1 FROM positions WHERE allocation_net <> ledger_net
  );
END $$;

CREATE OR REPLACE FUNCTION check_expense_current_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_row RECORD; payer_total BIGINT; split_total BIGINT;
BEGIN
  SELECT e."currentRevisionId", e."version", e."status", r."expenseId", r."revision", r."action", r."totalMinor", r."currency"
    INTO current_row
    FROM "Expense" e
    LEFT JOIN "ExpenseRevision" r ON r."id" = e."currentRevisionId"
    WHERE e."id" = NEW."id";
  SELECT COALESCE(SUM("amountMinor"), 0) INTO payer_total FROM "ExpensePayer" WHERE "revisionId" = current_row."currentRevisionId";
  SELECT COALESCE(SUM("amountMinor"), 0) INTO split_total FROM "ExpenseSplit" WHERE "revisionId" = current_row."currentRevisionId";
  IF current_row."currentRevisionId" IS NULL
     OR current_row."expenseId" IS DISTINCT FROM NEW."id"
     OR current_row."revision" IS DISTINCT FROM current_row."version"
     OR (current_row."status" = 'DELETED') IS DISTINCT FROM (current_row."action" = 'DELETED')
     OR payer_total IS DISTINCT FROM current_row."totalMinor"
     OR split_total IS DISTINCT FROM current_row."totalMinor"
     OR EXISTS (
       SELECT 1 FROM "LedgerEntry"
       WHERE "revisionId" = current_row."currentRevisionId"
         AND "currency" <> current_row."currency"
     )
     OR NOT financial_revision_ledger_is_valid(current_row."currentRevisionId", current_row."status") THEN
    RAISE EXCEPTION 'invalid current expense revision' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION check_ledger_allocation_net() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status "ExpenseStatus";
BEGIN
  SELECT e."status" INTO current_status
    FROM "Expense" e
    WHERE e."currentRevisionId" = NEW."revisionId";
  IF current_status IS NULL
     OR NOT financial_revision_ledger_is_valid(NEW."revisionId", current_status) THEN
    RAISE EXCEPTION 'ledger does not reproduce allocation positions' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "LedgerEntry_allocation_net"
AFTER INSERT ON "LedgerEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_ledger_allocation_net();
