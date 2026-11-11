-- Optional extra layer, run ONCE later (before security testing), as the database owner.
-- The "no delete / no rewrite" rules are already enforced by database triggers
-- (migration 20261111090000_protect_records), which apply to every connection.
-- This file adds least privilege on top: a separate login for the app that has
-- no DELETE rights on protected tables and cannot alter the schema or drop the triggers.
-- After running it, change DATABASE_URL in server/.env to use speaksafe_app.

CREATE ROLE speaksafe_app LOGIN PASSWORD 'choose-a-strong-password';
GRANT USAGE ON SCHEMA public TO speaksafe_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO speaksafe_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO speaksafe_app;

-- Deletion only where it is legitimate: expired sessions, MFA resets, a reporter's own journal.
GRANT DELETE ON "Session", "MfaFactor", "Journal", "JournalEntry", "Attachment" TO speaksafe_app;

-- Records that can never be rewritten.
REVOKE UPDATE ON "AuditLog", "Message", "CaseNote", "ReportKey" FROM speaksafe_app;
-- On "Case" only workflow columns may change.
REVOKE UPDATE ON "Case" FROM speaksafe_app;
GRANT UPDATE ("status", "assignedHandlerId", "updatedAt", "lastHandlerActionAt") ON "Case" TO speaksafe_app;
