-- Redesign: one installation serves exactly one school with many branches.
--
-- Removes the multi-school (SaaS) model: the schools tenant table, school memberships, per-school
-- roles, school_id columns, platform-admin functions, and tenant RLS. Access is now a property of
-- the user (school-wide or assigned branches) and row-level security is keyed on a signed-in user
-- plus branch scope.
--
-- Data conversion: an existing single school becomes the school profile, memberships become
-- user access (scope, branches, roles), and suspended memberships become deactivated accounts.
-- The migration refuses to run if more than one school exists, because merging separate schools
-- cannot be done safely automatically.

DO $$
DECLARE
  school_count integer;
BEGIN
  SELECT count(*) INTO school_count FROM schools;
  IF school_count > 1 THEN
    RAISE EXCEPTION 'Single-school conversion found % schools. Export and remove all but one school before migrating.', school_count;
  END IF;
END
$$;
--> statement-breakpoint

-- 1. School profile (singleton) --------------------------------------------------------------
CREATE TABLE school_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  name text NOT NULL,
  short_name text,
  timezone text NOT NULL DEFAULT 'UTC',
  locale text NOT NULL DEFAULT 'en',
  email text,
  phone text,
  address text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT school_settings_singleton CHECK (id = 1)
);
--> statement-breakpoint
INSERT INTO school_settings (id, name, timezone, locale, created_at)
SELECT 1, name, timezone, locale, created_at FROM schools ORDER BY created_at LIMIT 1;
--> statement-breakpoint
INSERT INTO school_settings (id, name) VALUES (1, 'My School') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- 2. Access moves from memberships onto users -----------------------------------------------
CREATE TYPE access_scope AS ENUM ('school', 'branch');
--> statement-breakpoint
ALTER TABLE users ADD COLUMN access_scope access_scope NOT NULL DEFAULT 'branch';
--> statement-breakpoint
UPDATE users u SET access_scope = m.scope::text::access_scope
FROM school_memberships m WHERE m.user_id = u.id;
--> statement-breakpoint
UPDATE users u SET status = 'deactivated'
FROM school_memberships m
WHERE m.user_id = u.id AND m.status <> 'active' AND u.status = 'active';
--> statement-breakpoint
ALTER TABLE users DROP COLUMN is_platform_admin;
--> statement-breakpoint

CREATE TABLE user_branches (
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_branches_user_id_branch_id_pk PRIMARY KEY (user_id, branch_id)
);
--> statement-breakpoint
INSERT INTO user_branches (user_id, branch_id, created_at)
SELECT m.user_id, mb.branch_id, mb.created_at
FROM membership_branches mb JOIN school_memberships m ON m.id = mb.membership_id;
--> statement-breakpoint
CREATE TABLE user_roles (
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_user_id_role_id_pk PRIMARY KEY (user_id, role_id)
);
--> statement-breakpoint
INSERT INTO user_roles (user_id, role_id, created_at)
SELECT m.user_id, mr.role_id, mr.created_at
FROM membership_roles mr JOIN school_memberships m ON m.id = mr.membership_id;
--> statement-breakpoint
-- Policies on schools reference school_memberships, so they must go first.
DROP POLICY schools_member_select ON schools;
--> statement-breakpoint
DROP POLICY schools_tenant ON schools;
--> statement-breakpoint
DROP TABLE membership_roles;
--> statement-breakpoint
DROP TABLE membership_branches;
--> statement-breakpoint
DROP TABLE school_memberships;
--> statement-breakpoint

-- 3. Roles become global ------------------------------------------------------------------------
DROP POLICY roles_tenant ON roles;
--> statement-breakpoint
DROP POLICY role_permissions_tenant ON role_permissions;
--> statement-breakpoint
ALTER TABLE role_permissions DROP CONSTRAINT role_permissions_role_fk;
--> statement-breakpoint
ALTER TABLE role_permissions DROP COLUMN school_id;
--> statement-breakpoint
ALTER TABLE roles DROP CONSTRAINT roles_school_id_key_key;
--> statement-breakpoint
ALTER TABLE roles DROP CONSTRAINT roles_school_id_id_key;
--> statement-breakpoint
ALTER TABLE roles DROP CONSTRAINT roles_school_id_schools_id_fk;
--> statement-breakpoint
ALTER TABLE roles DROP COLUMN school_id;
--> statement-breakpoint
ALTER TABLE roles ADD CONSTRAINT roles_key_key UNIQUE (key);
--> statement-breakpoint
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_id_roles_id_fk
  FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE cascade;
--> statement-breakpoint

-- 4. Branches no longer carry a school -----------------------------------------------------------
DROP POLICY branches_tenant_select ON branches;
--> statement-breakpoint
DROP POLICY branches_tenant_insert ON branches;
--> statement-breakpoint
DROP POLICY branches_tenant_update ON branches;
--> statement-breakpoint
ALTER TABLE audit_events DROP CONSTRAINT audit_events_branch_fk;
--> statement-breakpoint
ALTER TABLE sessions DROP CONSTRAINT sessions_active_branch_fk;
--> statement-breakpoint
ALTER TABLE sessions DROP CONSTRAINT sessions_branch_requires_school;
--> statement-breakpoint
ALTER TABLE branches DROP CONSTRAINT branches_school_id_code_key;
--> statement-breakpoint
ALTER TABLE branches DROP CONSTRAINT branches_school_id_id_key;
--> statement-breakpoint
ALTER TABLE branches DROP CONSTRAINT branches_school_id_schools_id_fk;
--> statement-breakpoint
ALTER TABLE branches DROP COLUMN school_id;
--> statement-breakpoint
ALTER TABLE branches ADD CONSTRAINT branches_code_key UNIQUE (code);
--> statement-breakpoint
ALTER TABLE branches ADD COLUMN area text;
--> statement-breakpoint
ALTER TABLE user_branches ADD CONSTRAINT user_branches_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE user_branches ADD CONSTRAINT user_branches_branch_id_branches_id_fk
  FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX user_branches_branch_id_idx ON user_branches (branch_id);
--> statement-breakpoint
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_id_roles_id_fk
  FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX user_roles_role_id_idx ON user_roles (role_id);
--> statement-breakpoint

-- 5. Audit events, sessions, invitations lose school_id ---------------------------------------
DROP POLICY audit_events_tenant_select ON audit_events;
--> statement-breakpoint
DROP POLICY audit_events_insert ON audit_events;
--> statement-breakpoint
DROP INDEX audit_events_school_id_occurred_at_idx;
--> statement-breakpoint
ALTER TABLE audit_events DROP CONSTRAINT audit_events_school_id_schools_id_fk;
--> statement-breakpoint
ALTER TABLE audit_events DROP COLUMN school_id;
--> statement-breakpoint
ALTER TABLE audit_events ADD CONSTRAINT audit_events_branch_id_branches_id_fk
  FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX audit_events_occurred_at_idx ON audit_events (occurred_at);
--> statement-breakpoint
ALTER TABLE sessions DROP CONSTRAINT sessions_active_school_id_schools_id_fk;
--> statement-breakpoint
ALTER TABLE sessions DROP COLUMN active_school_id;
--> statement-breakpoint
ALTER TABLE sessions ADD CONSTRAINT sessions_active_branch_id_branches_id_fk
  FOREIGN KEY (active_branch_id) REFERENCES branches (id) ON DELETE set null;
--> statement-breakpoint
DROP POLICY user_invitations_tenant ON user_invitations;
--> statement-breakpoint
DROP INDEX user_invitations_school_id_user_id_idx;
--> statement-breakpoint
ALTER TABLE user_invitations DROP CONSTRAINT user_invitations_school_id_schools_id_fk;
--> statement-breakpoint
ALTER TABLE user_invitations DROP COLUMN school_id;
--> statement-breakpoint
CREATE INDEX user_invitations_user_id_idx ON user_invitations (user_id);
--> statement-breakpoint

-- 6. Remove the tenant table, platform functions, and tenant helpers ---------------------------
DROP TRIGGER schools_install_system_roles ON schools;
--> statement-breakpoint
DROP TRIGGER schools_touch_updated_at ON schools;
--> statement-breakpoint
DROP FUNCTION app.on_school_created();
--> statement-breakpoint
DROP FUNCTION app.install_system_roles(uuid);
--> statement-breakpoint
DROP FUNCTION app.count_other_memberships(uuid, uuid, boolean);
--> statement-breakpoint
DROP FUNCTION app.platform_school_counts();
--> statement-breakpoint
DROP FUNCTION app.consume_invitation(text);
--> statement-breakpoint
DROP FUNCTION app.in_school(uuid);
--> statement-breakpoint
DROP FUNCTION app.current_school_id();
--> statement-breakpoint
DROP TABLE schools;
--> statement-breakpoint
DROP TYPE school_status;
--> statement-breakpoint
DROP TYPE membership_status;
--> statement-breakpoint
DROP TYPE membership_scope;
--> statement-breakpoint

-- 7. System roles (global) -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.install_system_roles() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  template record;
BEGIN
  FOR template IN
    SELECT * FROM (VALUES
      ('school_admin', 'School administrator', 'Full access to every branch of the school',
        ARRAY['school.settings.manage','branches.read','branches.manage','users.read','users.invite',
              'users.update','users.deactivate','users.assign_roles','audit.read']),
      ('branch_admin', 'Branch administrator', 'Manages staff in assigned branches',
        ARRAY['branches.read','users.read','users.invite','users.update','users.deactivate',
              'users.assign_roles']),
      ('teacher', 'Teacher', 'Assigned classes and subjects', ARRAY['branches.read']),
      ('registrar', 'Registrar', 'Admissions and student records', ARRAY['branches.read']),
      ('finance_officer', 'Finance officer', 'Fees and payments', ARRAY['branches.read']),
      ('auditor', 'Auditor', 'Read-only reports and audit log',
        ARRAY['branches.read','users.read','audit.read'])
    ) AS t(key, name, description, perms)
  LOOP
    INSERT INTO roles (key, name, description, is_system)
    VALUES (template.key, template.name, template.description, true)
    ON CONFLICT (key) DO UPDATE
      SET name = EXCLUDED.name, description = EXCLUDED.description, is_system = true;

    DELETE FROM role_permissions rp
    USING roles r
    WHERE rp.role_id = r.id AND r.key = template.key AND rp.permission_code <> ALL (template.perms);

    INSERT INTO role_permissions (role_id, permission_code)
    SELECT r.id, p.code FROM roles r CROSS JOIN unnest(template.perms) AS p(code)
    WHERE r.key = template.key
    ON CONFLICT DO NOTHING;
  END LOOP;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.install_system_roles() FROM PUBLIC;
--> statement-breakpoint
SELECT app.install_system_roles();
--> statement-breakpoint

-- 8. Invitation consumption (the invitee has no session yet) ----------------------------------
CREATE OR REPLACE FUNCTION app.consume_invitation(p_token_hash text)
  RETURNS TABLE (user_id uuid)
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    UPDATE user_invitations i SET accepted_at = now()
    WHERE i.token_hash = p_token_hash
      AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
    RETURNING i.user_id
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.consume_invitation(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.consume_invitation(text) TO app_runtime;
--> statement-breakpoint

-- 9. Row-level security: a signed-in user context is required, branch data is scoped -----------
-- app.has_user() is true only inside a transaction where the server set app.user_id for a
-- validated session. Without it, every policy below matches nothing (fail closed).
CREATE OR REPLACE FUNCTION app.has_user() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT app.current_user_id() IS NOT NULL $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.has_user() TO app_runtime;
--> statement-breakpoint

CREATE TRIGGER school_settings_touch_updated_at BEFORE UPDATE ON school_settings
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
GRANT SELECT, UPDATE ON school_settings TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON user_branches TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON user_roles TO app_runtime;
--> statement-breakpoint

ALTER TABLE school_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_branches ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- The school name is shown on public pages (sign-in), so it is readable without a session.
CREATE POLICY school_settings_read ON school_settings FOR SELECT TO app_runtime USING (true);
--> statement-breakpoint
CREATE POLICY school_settings_update ON school_settings FOR UPDATE TO app_runtime
  USING (app.has_user()) WITH CHECK (app.has_user());
--> statement-breakpoint

CREATE POLICY branches_select ON branches FOR SELECT TO app_runtime
  USING (app.has_user() AND app.branch_visible(id));
--> statement-breakpoint
CREATE POLICY branches_insert ON branches FOR INSERT TO app_runtime
  WITH CHECK (app.has_user() AND app.current_scope() = 'school');
--> statement-breakpoint
CREATE POLICY branches_update ON branches FOR UPDATE TO app_runtime
  USING (app.has_user() AND app.branch_visible(id))
  WITH CHECK (app.has_user() AND app.branch_visible(id));
--> statement-breakpoint

CREATE POLICY roles_read ON roles FOR SELECT TO app_runtime USING (app.has_user());
--> statement-breakpoint
CREATE POLICY role_permissions_read ON role_permissions FOR SELECT TO app_runtime
  USING (app.has_user());
--> statement-breakpoint

CREATE POLICY user_roles_access ON user_roles FOR ALL TO app_runtime
  USING (app.has_user()) WITH CHECK (app.has_user());
--> statement-breakpoint
-- A branch-scoped actor can never write an assignment to a branch outside their own scope.
CREATE POLICY user_branches_read ON user_branches FOR SELECT TO app_runtime USING (app.has_user());
--> statement-breakpoint
CREATE POLICY user_branches_insert ON user_branches FOR INSERT TO app_runtime
  WITH CHECK (app.has_user() AND app.branch_visible(branch_id));
--> statement-breakpoint
CREATE POLICY user_branches_delete ON user_branches FOR DELETE TO app_runtime
  USING (app.has_user() AND app.branch_visible(branch_id));
--> statement-breakpoint

CREATE POLICY audit_events_read ON audit_events FOR SELECT TO app_runtime
  USING (app.has_user() AND (branch_id IS NULL OR app.branch_visible(branch_id)));
--> statement-breakpoint
-- Failed sign-ins are recorded before any user context exists, so inserts are always allowed.
CREATE POLICY audit_events_insert ON audit_events FOR INSERT TO app_runtime WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY user_invitations_access ON user_invitations FOR ALL TO app_runtime
  USING (app.has_user()) WITH CHECK (app.has_user());
