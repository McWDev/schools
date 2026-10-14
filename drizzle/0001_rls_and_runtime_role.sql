-- Defense in depth for tenant isolation (Task 001).
--
-- The application connects as "app_runtime", which does not own any table, so row-level security
-- applies to it. Each request runs in a transaction that sets app.* values with
-- set_config(..., is_local => true); they reset at COMMIT/ROLLBACK and cannot leak to the next user
-- of a pooled connection. When no tenant context is set, the helper functions return NULL / empty
-- and the policies match no rows (fail closed).
--
-- Migrations and seeding run as the database owner, which bypasses RLS by design.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO app_runtime;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_runtime;
--> statement-breakpoint

-- Tenant context accessors. An invalid value raises an error, which also fails closed.
CREATE OR REPLACE FUNCTION app.current_school_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.school_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.current_scope() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.scope', true), '') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.current_branch_ids() RETURNS uuid[]
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('app.branch_ids', true), '')::uuid[], '{}'::uuid[])
  $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.in_school(target uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT target IS NOT NULL AND target = app.current_school_id() $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.branch_visible(target uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT app.current_scope() = 'school' OR target = ANY (app.current_branch_ids())
  $$;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_runtime;
--> statement-breakpoint

-- Keep updated_at accurate regardless of caller.
CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER schools_touch_updated_at BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER branches_touch_updated_at BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER school_memberships_touch_updated_at BEFORE UPDATE ON school_memberships
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint

-- Audit events are append-only for every role, including the owner.
CREATE OR REPLACE FUNCTION app.reject_audit_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();
--> statement-breakpoint

-- Table privileges for the runtime role. Deletes are intentionally not granted on history tables.
GRANT SELECT, UPDATE ON schools TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON branches TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON users TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON school_memberships TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON membership_branches TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_events TO app_runtime;
--> statement-breakpoint

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE school_memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membership_branches ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- schools: only the school in the current context.
CREATE POLICY schools_tenant ON schools FOR ALL TO app_runtime
  USING (app.in_school(id))
  WITH CHECK (app.in_school(id));
--> statement-breakpoint

-- branches: same school, and the branch must be within the caller's branch scope.
CREATE POLICY branches_tenant_select ON branches FOR SELECT TO app_runtime
  USING (app.in_school(school_id) AND app.branch_visible(id));
--> statement-breakpoint
CREATE POLICY branches_tenant_insert ON branches FOR INSERT TO app_runtime
  WITH CHECK (app.in_school(school_id) AND app.current_scope() = 'school');
--> statement-breakpoint
CREATE POLICY branches_tenant_update ON branches FOR UPDATE TO app_runtime
  USING (app.in_school(school_id) AND app.branch_visible(id))
  WITH CHECK (app.in_school(school_id) AND app.branch_visible(id));
--> statement-breakpoint

-- school_memberships: rows of the current school, plus the caller's own memberships so the
-- server can resolve which schools a signed-in user belongs to before a school is selected.
CREATE POLICY school_memberships_tenant ON school_memberships FOR ALL TO app_runtime
  USING (app.in_school(school_id))
  WITH CHECK (app.in_school(school_id));
--> statement-breakpoint
CREATE POLICY school_memberships_self_select ON school_memberships FOR SELECT TO app_runtime
  USING (user_id IS NOT NULL AND user_id = app.current_user_id());
--> statement-breakpoint

-- membership_branches: rows of the current school, plus rows of the caller's own memberships.
CREATE POLICY membership_branches_tenant ON membership_branches FOR ALL TO app_runtime
  USING (app.in_school(school_id))
  WITH CHECK (app.in_school(school_id));
--> statement-breakpoint
CREATE POLICY membership_branches_self_select ON membership_branches FOR SELECT TO app_runtime
  USING (EXISTS (
    SELECT 1 FROM school_memberships m
    WHERE m.id = membership_id AND m.user_id = app.current_user_id()
  ));
--> statement-breakpoint

-- audit_events: read your own school's events; write events for your school or platform-level
-- events (school_id IS NULL, e.g. a failed sign-in before any school is known).
CREATE POLICY audit_events_tenant_select ON audit_events FOR SELECT TO app_runtime
  USING (app.in_school(school_id));
--> statement-breakpoint
CREATE POLICY audit_events_insert ON audit_events FOR INSERT TO app_runtime
  WITH CHECK (school_id IS NULL OR app.in_school(school_id));
