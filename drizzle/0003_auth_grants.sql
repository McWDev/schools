-- Task 002: runtime privileges for authentication tables.
-- These are global (not tenant-owned) tables, so they have no tenant RLS policies. They are
-- reached only through src/server/auth, which looks rows up by hashed token or user ID.
GRANT SELECT, INSERT, UPDATE ON sessions TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON password_reset_tokens TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_rate_limits TO app_runtime;
--> statement-breakpoint
-- Tokens are always random 256-bit values hashed with SHA-256 (64 hex chars).
ALTER TABLE sessions ADD CONSTRAINT sessions_token_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE password_reset_tokens
  ADD CONSTRAINT password_reset_tokens_token_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE sessions ADD CONSTRAINT sessions_expiry_after_creation CHECK (expires_at > created_at);
--> statement-breakpoint
-- Let a signed-in user see the names of schools they actively belong to (for the school
-- picker) before any school is selected. Other schools remain invisible.
CREATE POLICY schools_member_select ON schools FOR SELECT TO app_runtime
  USING (EXISTS (
    SELECT 1 FROM school_memberships m
    WHERE m.school_id = schools.id AND m.user_id = app.current_user_id() AND m.status = 'active'
  ));
