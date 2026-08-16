CREATE TABLE "DeletedAuthIdentity" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "provider" "AuthProvider" NOT NULL,
  "subjectHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeletedAuthIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeletedAuthIdentity_provider_subjectHash_key"
ON "DeletedAuthIdentity"("provider", "subjectHash");
CREATE INDEX "DeletedAuthIdentity_userId_idx"
ON "DeletedAuthIdentity"("userId");

ALTER TABLE "DeletedAuthIdentity"
ADD CONSTRAINT "DeletedAuthIdentity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
