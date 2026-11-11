-- SpeakSafe: records that protect reporters can never be deleted or rewritten.
-- These are database TRIGGERS, so they apply to every connection: the app, a database
-- tool, or someone who obtains the app's credentials. Nothing in the app can remove a report.

-- 1. Block DELETE and TRUNCATE on protected tables.
CREATE OR REPLACE FUNCTION ss_forbid_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SpeakSafe: deleting records from "%" is not allowed', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Case','CaseAccess','ReportKey','Message','CaseNote',
                           'Exclusion','Recusal','ClosureApproval','AuditLog'] LOOP
    EXECUTE format('CREATE TRIGGER ss_no_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ss_forbid_delete()', t);
    EXECUTE format('CREATE TRIGGER ss_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION ss_forbid_delete()', t);
  END LOOP;
END $$;

-- Evidence attached to a submitted case can never be deleted.
-- (Evidence in a reporter's own private journal can still be removed by that reporter.)
CREATE OR REPLACE FUNCTION ss_forbid_case_attachment_delete() RETURNS trigger AS $$
BEGIN
  IF OLD."caseId" IS NOT NULL THEN
    RAISE EXCEPTION 'SpeakSafe: evidence attached to a case cannot be deleted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ss_no_delete_case_evidence BEFORE DELETE ON "Attachment"
  FOR EACH ROW EXECUTE FUNCTION ss_forbid_case_attachment_delete();
CREATE TRIGGER ss_no_truncate BEFORE TRUNCATE ON "Attachment"
  FOR EACH STATEMENT EXECUTE FUNCTION ss_forbid_delete();

-- 2. Block any UPDATE on records that must stay exactly as written.
CREATE OR REPLACE FUNCTION ss_forbid_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SpeakSafe: records in "%" cannot be changed', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ss_no_update BEFORE UPDATE ON "AuditLog"  FOR EACH ROW EXECUTE FUNCTION ss_forbid_update();
CREATE TRIGGER ss_no_update BEFORE UPDATE ON "Message"   FOR EACH ROW EXECUTE FUNCTION ss_forbid_update();
CREATE TRIGGER ss_no_update BEFORE UPDATE ON "CaseNote"  FOR EACH ROW EXECUTE FUNCTION ss_forbid_update();
CREATE TRIGGER ss_no_update BEFORE UPDATE ON "ReportKey" FOR EACH ROW EXECUTE FUNCTION ss_forbid_update();

-- 3. A submitted report's content is immutable; only workflow fields (status, assignment) may change.
CREATE OR REPLACE FUNCTION ss_protect_case_content() RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."ciphertext" IS DISTINCT FROM OLD."ciphertext"
     OR NEW."nonce" IS DISTINCT FROM OLD."nonce"
     OR NEW."fingerprint" IS DISTINCT FROM OLD."fingerprint"
     OR NEW."mode" IS DISTINCT FROM OLD."mode"
     OR NEW."categoryId" IS DISTINCT FROM OLD."categoryId"
     OR NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt" THEN
    RAISE EXCEPTION 'SpeakSafe: the content of a submitted report cannot be changed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ss_protect_content BEFORE UPDATE ON "Case"
  FOR EACH ROW EXECUTE FUNCTION ss_protect_case_content();

-- The reporter's way back in (salt, verifier, public key) cannot be swapped by an insider.
CREATE OR REPLACE FUNCTION ss_protect_case_access() RETURNS trigger AS $$
BEGIN
  IF NEW."caseId" IS DISTINCT FROM OLD."caseId"
     OR NEW."salt" IS DISTINCT FROM OLD."salt"
     OR NEW."authVerifier" IS DISTINCT FROM OLD."authVerifier"
     OR NEW."reporterPublicKey" IS DISTINCT FROM OLD."reporterPublicKey" THEN
    RAISE EXCEPTION 'SpeakSafe: case access details cannot be changed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ss_protect_access BEFORE UPDATE ON "CaseAccess"
  FOR EACH ROW EXECUTE FUNCTION ss_protect_case_access();
