-- Feature 6: the old passphrase-based journal (never used since private spaces replaced passphrases)
-- is replaced by a journal and evidence locker that belong to the reporter's private space.
/*
  Warnings:

  - You are about to drop the column `journalEntryId` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `journalId` on the `JournalEntry` table. All the data in the column will be lost.
  - You are about to drop the column `nonce` on the `JournalEntry` table. All the data in the column will be lost.
  - You are about to drop the `Journal` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `accountId` to the `JournalEntry` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_journalEntryId_fkey";

-- DropForeignKey
ALTER TABLE "JournalEntry" DROP CONSTRAINT "JournalEntry_journalId_fkey";

-- AlterTable
ALTER TABLE "Attachment" DROP COLUMN "journalEntryId";

-- AlterTable
ALTER TABLE "JournalEntry" DROP COLUMN "journalId",
DROP COLUMN "nonce",
ADD COLUMN     "accountId" TEXT NOT NULL;

-- DropTable
DROP TABLE "Journal";

-- CreateTable
CREATE TABLE "LockerFile" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "meta" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LockerFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LockerFile_accountId_idx" ON "LockerFile"("accountId");

-- CreateIndex
CREATE INDEX "JournalEntry_accountId_idx" ON "JournalEntry"("accountId");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ReporterAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LockerFile" ADD CONSTRAINT "LockerFile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ReporterAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
