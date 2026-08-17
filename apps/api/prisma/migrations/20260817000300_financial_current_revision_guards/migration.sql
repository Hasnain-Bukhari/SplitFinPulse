CREATE FUNCTION prevent_expense_context_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."groupId" IS DISTINCT FROM NEW."groupId" OR OLD."friendshipId" IS DISTINCT FROM NEW."friendshipId" THEN
    RAISE EXCEPTION 'expense context is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Expense_context_immutable"
BEFORE UPDATE ON "Expense"
FOR EACH ROW EXECUTE FUNCTION prevent_expense_context_mutation();

CREATE FUNCTION check_expense_current_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_row RECORD;
BEGIN
  SELECT e."currentRevisionId", e."version", e."status", r."expenseId", r."revision", r."action"
    INTO current_row
    FROM "Expense" e
    LEFT JOIN "ExpenseRevision" r ON r."id" = e."currentRevisionId"
    WHERE e."id" = NEW."id";
  IF current_row."currentRevisionId" IS NULL
     OR current_row."expenseId" IS DISTINCT FROM NEW."id"
     OR current_row."revision" IS DISTINCT FROM current_row."version"
     OR (current_row."status" = 'DELETED') IS DISTINCT FROM (current_row."action" = 'DELETED') THEN
    RAISE EXCEPTION 'invalid current expense revision' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "Expense_current_revision_guard"
AFTER INSERT OR UPDATE ON "Expense"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_expense_current_revision();
