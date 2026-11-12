-- CreateTable
CREATE TABLE "ReporterAccount" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "pwSalt" TEXT NOT NULL,
    "authHash" TEXT NOT NULL,
    "masterKeyEnc" TEXT NOT NULL,
    "recSalt" TEXT NOT NULL,
    "recAuthHash" TEXT NOT NULL,
    "masterKeyRecEnc" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "secretKeyEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReporterAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReporterSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReporterSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReporterAccount_username_key" ON "ReporterAccount"("username");

-- CreateIndex
CREATE INDEX "ReporterSession_accountId_idx" ON "ReporterSession"("accountId");

-- AddForeignKey
ALTER TABLE "ReporterSession" ADD CONSTRAINT "ReporterSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ReporterAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
