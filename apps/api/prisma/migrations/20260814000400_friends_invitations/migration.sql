CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REMOVED');

CREATE TABLE "Friendship" (
  "id" UUID NOT NULL,
  "firstUserId" UUID NOT NULL,
  "secondUserId" UUID NOT NULL,
  "requestedById" UUID NOT NULL,
  "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "removedAt" TIMESTAMP(3),
  CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Friendship_distinct_users_check" CHECK ("firstUserId" < "secondUserId"),
  CONSTRAINT "Friendship_requester_is_participant_check" CHECK ("requestedById" IN ("firstUserId", "secondUserId"))
);

CREATE TABLE "FriendInvitation" (
  "id" UUID NOT NULL,
  "inviterId" UUID NOT NULL,
  "tokenDigest" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "acceptedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FriendInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FriendInvitation_consumption_check" CHECK (
    ("consumedAt" IS NULL AND "acceptedById" IS NULL) OR
    ("consumedAt" IS NOT NULL AND "acceptedById" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "Friendship_firstUserId_secondUserId_key" ON "Friendship"("firstUserId", "secondUserId");
CREATE INDEX "Friendship_firstUserId_status_updatedAt_id_idx" ON "Friendship"("firstUserId", "status", "updatedAt", "id");
CREATE INDEX "Friendship_secondUserId_status_updatedAt_id_idx" ON "Friendship"("secondUserId", "status", "updatedAt", "id");
CREATE INDEX "Friendship_requestedById_status_updatedAt_id_idx" ON "Friendship"("requestedById", "status", "updatedAt", "id");
CREATE UNIQUE INDEX "FriendInvitation_tokenDigest_key" ON "FriendInvitation"("tokenDigest");
CREATE INDEX "FriendInvitation_inviterId_createdAt_idx" ON "FriendInvitation"("inviterId", "createdAt");
CREATE INDEX "FriendInvitation_expiresAt_idx" ON "FriendInvitation"("expiresAt");
CREATE INDEX "FriendInvitation_acceptedById_idx" ON "FriendInvitation"("acceptedById");

ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_firstUserId_fkey" FOREIGN KEY ("firstUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_secondUserId_fkey" FOREIGN KEY ("secondUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FriendInvitation" ADD CONSTRAINT "FriendInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FriendInvitation" ADD CONSTRAINT "FriendInvitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
