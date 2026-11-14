-- Feature 8: "Not alone" matching (held reports and OPRF match tokens).
-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "held" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "releasedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MatchTag" (
    "caseId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchTag_pkey" PRIMARY KEY ("caseId")
);

-- CreateIndex
CREATE INDEX "MatchTag_token_idx" ON "MatchTag"("token");

-- AddForeignKey
ALTER TABLE "MatchTag" ADD CONSTRAINT "MatchTag_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A released report can never be hidden again: "held" may only change from true to false.
CREATE OR REPLACE FUNCTION ss_held_one_way() RETURNS trigger AS $$
BEGIN
  IF OLD."held" = false AND NEW."held" = true THEN
    RAISE EXCEPTION 'SpeakSafe: a released report cannot be held again'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ss_held_one_way BEFORE UPDATE ON "Case"
  FOR EACH ROW EXECUTE FUNCTION ss_held_one_way();

-- Match tokens are part of the record: they cannot be deleted or changed.
CREATE TRIGGER ss_no_delete BEFORE DELETE ON "MatchTag" FOR EACH ROW EXECUTE FUNCTION ss_forbid_delete();
CREATE TRIGGER ss_no_truncate BEFORE TRUNCATE ON "MatchTag" FOR EACH STATEMENT EXECUTE FUNCTION ss_forbid_delete();
CREATE TRIGGER ss_no_update BEFORE UPDATE ON "MatchTag" FOR EACH ROW EXECUTE FUNCTION ss_forbid_update();
