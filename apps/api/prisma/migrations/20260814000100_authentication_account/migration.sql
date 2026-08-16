CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DEACTIVATED', 'DELETED');
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE');
CREATE TYPE "OidcIntent" AS ENUM ('LOGIN', 'REAUTHENTICATE', 'REACTIVATE');
CREATE TYPE "AccountLifecycleEventType" AS ENUM ('DATA_EXPORTED', 'DEACTIVATED', 'REACTIVATED', 'DELETED');

CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "email" VARCHAR(320),
  "name" VARCHAR(100) NOT NULL,
  "avatarUrl" VARCHAR(2048),
  "providerAvatarUrl" VARCHAR(2048),
  "defaultCurrency" CHAR(3) NOT NULL DEFAULT 'USD',
  "timezone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
  "locale" VARCHAR(35) NOT NULL DEFAULT 'en-US',
  "notifyExpenseActivity" BOOLEAN NOT NULL DEFAULT true,
  "notifyReminders" BOOLEAN NOT NULL DEFAULT true,
  "notifyInvitations" BOOLEAN NOT NULL DEFAULT true,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deactivatedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "User_currency_check" CHECK ("defaultCurrency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "AuthIdentity" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "provider" "AuthProvider" NOT NULL,
  "providerSubject" VARCHAR(255) NOT NULL,
  "providerEmail" VARCHAR(320) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "refreshTokenHash" CHAR(64) NOT NULL,
  "tokenVersion" INTEGER NOT NULL DEFAULT 1,
  "deviceDescription" VARCHAR(160) NOT NULL,
  "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
  "idleExpiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reauthenticatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "revokedReason" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OidcTransaction" (
  "id" UUID NOT NULL,
  "stateHash" CHAR(64) NOT NULL,
  "codeVerifier" VARCHAR(128) NOT NULL,
  "nonce" VARCHAR(128) NOT NULL,
  "intent" "OidcIntent" NOT NULL DEFAULT 'LOGIN',
  "returnTo" VARCHAR(500) NOT NULL,
  "sessionId" UUID,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OidcTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountLifecycleEvent" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" "AccountLifecycleEventType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_status_idx" ON "User"("status");
CREATE UNIQUE INDEX "AuthIdentity_provider_providerSubject_key" ON "AuthIdentity"("provider", "providerSubject");
CREATE UNIQUE INDEX "AuthIdentity_userId_provider_key" ON "AuthIdentity"("userId", "provider");
CREATE INDEX "AuthIdentity_userId_idx" ON "AuthIdentity"("userId");
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");
CREATE INDEX "AuthSession_absoluteExpiresAt_idx" ON "AuthSession"("absoluteExpiresAt");
CREATE UNIQUE INDEX "OidcTransaction_stateHash_key" ON "OidcTransaction"("stateHash");
CREATE INDEX "OidcTransaction_expiresAt_idx" ON "OidcTransaction"("expiresAt");
CREATE INDEX "AccountLifecycleEvent_userId_createdAt_idx" ON "AccountLifecycleEvent"("userId", "createdAt");

ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountLifecycleEvent" ADD CONSTRAINT "AccountLifecycleEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
