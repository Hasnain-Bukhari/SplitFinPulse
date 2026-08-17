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
     ) THEN
    RAISE EXCEPTION 'invalid current expense revision' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
