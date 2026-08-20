CREATE TABLE "ActivityEvent" (
  "id" UUID NOT NULL, "type" VARCHAR(80) NOT NULL,
  "actorId" UUID, "entityType" VARCHAR(40) NOT NULL, "entityId" UUID NOT NULL,
  "groupId" UUID, "friendshipId" UUID, "payloadVersion" INTEGER NOT NULL DEFAULT 1, "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActivityEvent_payload_version_check" CHECK ("payloadVersion" > 0),
  CONSTRAINT "ActivityEvent_scope_check" CHECK (("groupId" IS NOT NULL)::int + ("friendshipId" IS NOT NULL)::int <= 1)
);
CREATE TABLE "ActivityAudience" (
  "id" UUID NOT NULL, "eventId" UUID NOT NULL,
  "userId" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityAudience_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExpenseComment" (
  "id" UUID NOT NULL, "expenseId" UUID NOT NULL,
  "authorId" UUID NOT NULL, "body" VARCHAR(2000), "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3), CONSTRAINT "ExpenseComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseComment_version_check" CHECK ("version" > 0),
  CONSTRAINT "ExpenseComment_deleted_state_check" CHECK (("deletedAt" IS NULL) = ("body" IS NOT NULL))
);
CREATE TABLE "AuditEvent" (
  "id" UUID NOT NULL, "actorId" UUID, "sessionId" UUID,
  "action" VARCHAR(80) NOT NULL, "targetType" VARCHAR(40) NOT NULL, "targetId" UUID,
  "outcome" VARCHAR(20) NOT NULL DEFAULT 'SUCCESS', "requestId" VARCHAR(128), "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditEvent_outcome_check" CHECK ("outcome" IN ('SUCCESS', 'DENIED', 'SECURITY_SIGNAL'))
);

CREATE INDEX "ActivityEvent_groupId_occurredAt_id_idx" ON "ActivityEvent"("groupId", "occurredAt", "id");
CREATE INDEX "ActivityEvent_friendshipId_occurredAt_id_idx" ON "ActivityEvent"("friendshipId", "occurredAt", "id");
CREATE INDEX "ActivityEvent_entityType_entityId_idx" ON "ActivityEvent"("entityType", "entityId");
CREATE UNIQUE INDEX "ActivityAudience_eventId_userId_key" ON "ActivityAudience"("eventId", "userId");
CREATE INDEX "ActivityAudience_userId_eventId_idx" ON "ActivityAudience"("userId", "eventId");
CREATE INDEX "ExpenseComment_expenseId_createdAt_id_idx" ON "ExpenseComment"("expenseId", "createdAt", "id");
CREATE INDEX "ExpenseComment_authorId_idx" ON "ExpenseComment"("authorId");
CREATE INDEX "AuditEvent_actorId_createdAt_id_idx" ON "AuditEvent"("actorId", "createdAt", "id");
CREATE INDEX "AuditEvent_targetType_targetId_createdAt_idx" ON "AuditEvent"("targetType", "targetId", "createdAt");
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_friendshipId_fkey" FOREIGN KEY ("friendshipId") REFERENCES "Friendship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityAudience" ADD CONSTRAINT "ActivityAudience_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ActivityEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityAudience" ADD CONSTRAINT "ActivityAudience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseComment" ADD CONSTRAINT "ExpenseComment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseComment" ADD CONSTRAINT "ExpenseComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION prevent_append_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."actorId" IS NOT NULL
     AND NEW."actorId" IS NULL
     AND (to_jsonb(NEW) - 'actorId') = (to_jsonb(OLD) - 'actorId') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'append-only history is immutable' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER "ActivityEvent_immutable" BEFORE UPDATE OR DELETE ON "ActivityEvent" FOR EACH ROW EXECUTE FUNCTION prevent_append_event_mutation();
CREATE TRIGGER "AuditEvent_immutable" BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION prevent_append_event_mutation();
CREATE FUNCTION prevent_append_only_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only history is immutable' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER "ActivityAudience_immutable" BEFORE UPDATE OR DELETE ON "ActivityAudience" FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();
