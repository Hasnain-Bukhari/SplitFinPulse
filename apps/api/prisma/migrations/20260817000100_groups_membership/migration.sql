CREATE TYPE "GroupType" AS ENUM ('TRIP', 'HOME', 'COUPLE', 'OTHER');
CREATE TYPE "GroupStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "GroupMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

CREATE TABLE "Group" (
  "id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "type" "GroupType" NOT NULL,
  "status" "GroupStatus" NOT NULL DEFAULT 'ACTIVE',
  "defaultCurrency" CHAR(3) NOT NULL,
  "simplifyDebtsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "Group_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Group_archive_state_check" CHECK (
    ("status" = 'ACTIVE' AND "archivedAt" IS NULL) OR
    ("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL)
  )
);

CREATE TABLE "GroupMember" (
  "id" UUID NOT NULL,
  "groupId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "GroupMemberRole" NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GroupMember_membership_interval_check" CHECK (
    "leftAt" IS NULL OR "leftAt" >= "joinedAt"
  )
);

CREATE TABLE "GroupInvitation" (
  "id" UUID NOT NULL,
  "groupId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "tokenDigest" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GroupInvitation_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE INDEX "Group_status_updatedAt_id_idx" ON "Group"("status", "updatedAt", "id");
CREATE INDEX "Group_createdById_idx" ON "Group"("createdById");
CREATE INDEX "GroupMember_groupId_leftAt_updatedAt_id_idx" ON "GroupMember"("groupId", "leftAt", "updatedAt", "id");
CREATE INDEX "GroupMember_userId_leftAt_updatedAt_id_idx" ON "GroupMember"("userId", "leftAt", "updatedAt", "id");
CREATE UNIQUE INDEX "GroupMember_active_user_key" ON "GroupMember"("groupId", "userId") WHERE "leftAt" IS NULL;
CREATE UNIQUE INDEX "GroupMember_active_owner_key" ON "GroupMember"("groupId") WHERE "role" = 'OWNER' AND "leftAt" IS NULL;
CREATE UNIQUE INDEX "GroupInvitation_tokenDigest_key" ON "GroupInvitation"("tokenDigest");
CREATE INDEX "GroupInvitation_groupId_createdAt_id_idx" ON "GroupInvitation"("groupId", "createdAt", "id");
CREATE INDEX "GroupInvitation_createdById_idx" ON "GroupInvitation"("createdById");
CREATE INDEX "GroupInvitation_expiresAt_idx" ON "GroupInvitation"("expiresAt");

ALTER TABLE "Group" ADD CONSTRAINT "Group_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupInvitation" ADD CONSTRAINT "GroupInvitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupInvitation" ADD CONSTRAINT "GroupInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
