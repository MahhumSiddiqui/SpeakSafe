-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "fingerprint" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'file';

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "aboutOther" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CaseAccess" ADD COLUMN     "reporterSealedKey" TEXT;

-- AlterTable
ALTER TABLE "ReporterAccount" ADD COLUMN     "vaultEnc" TEXT;

-- CreateTable
CREATE TABLE "ReporterDraft" (
    "accountId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReporterDraft_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "DraftFile" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftFile_accountId_idx" ON "DraftFile"("accountId");

-- AddForeignKey
ALTER TABLE "ReporterDraft" ADD CONSTRAINT "ReporterDraft_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ReporterAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftFile" ADD CONSTRAINT "DraftFile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ReporterAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep the reporter's sealed key immutable too (extends 20261111090000_protect_records).
CREATE OR REPLACE FUNCTION ss_protect_case_access() RETURNS trigger AS $$
BEGIN
  IF NEW."caseId" IS DISTINCT FROM OLD."caseId"
     OR NEW."salt" IS DISTINCT FROM OLD."salt"
     OR NEW."authVerifier" IS DISTINCT FROM OLD."authVerifier"
     OR NEW."reporterPublicKey" IS DISTINCT FROM OLD."reporterPublicKey"
     OR NEW."reporterSealedKey" IS DISTINCT FROM OLD."reporterSealedKey" THEN
    RAISE EXCEPTION 'SpeakSafe: case access details cannot be changed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
