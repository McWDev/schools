-- Task 003: permissions, system roles, invitations — privileges and row-level security.

-- Permission catalog. Codes are stable identifiers referenced by application code.
INSERT INTO permissions (code, description) VALUES
  ('school.settings.manage', 'Change school-wide settings'),
  ('branches.read', 'View branches'),
  ('branches.manage', 'Create and edit branches'),
  ('users.read', 'View staff accounts'),
  ('users.invite', 'Invite staff'),
  ('users.update', 'Edit staff details'),
  ('users.deactivate', 'Deactivate and reactivate staff'),
  ('users.assign_roles', 'Change staff roles and branch access'),
  ('audit.read', 'View the audit log')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;
--> statement-breakpoint

-- Installs (or re-syncs) the system role templates for one school. Owner-only.
CREATE OR REPLACE FUNCTION app.install_system_roles(p_school_id uuid) RETURNS void
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
    INSERT INTO roles (school_id, key, name, description, is_system)
    VALUES (p_school_id, template.key, template.name, template.description, true)
    ON CONFLICT (school_id, key) DO UPDATE
      SET name = EXCLUDED.name, description = EXCLUDED.description, is_system = true;

    DELETE FROM role_permissions rp
    USING roles r
    WHERE rp.role_id = r.id AND r.school_id = p_school_id AND r.key = template.key
      AND rp.permission_code <> ALL (template.perms);

    INSERT INTO role_permissions (school_id, role_id, permission_code)
    SELECT p_school_id, r.id, p.code
    FROM roles r CROSS JOIN unnest(template.perms) AS p(code)
    WHERE r.school_id = p_school_id AND r.key = template.key
    ON CONFLICT DO NOTHING;
  END LOOP;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.install_system_roles(uuid) FROM PUBLIC;
--> statement-breakpoint

-- Every new school gets the system roles automatically, whoever creates it.
CREATE OR REPLACE FUNCTION app.on_school_created() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app.install_system_roles(NEW.id);
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.on_school_created() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER schools_install_system_roles AFTER INSERT ON schools
  FOR EACH ROW EXECUTE FUNCTION app.on_school_created();
--> statement-breakpoint
SELECT app.install_system_roles(id) FROM schools;
--> statement-breakpoint
CREATE TRIGGER roles_touch_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint

ALTER TABLE user_invitations
  ADD CONSTRAINT user_invitations_token_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$');
--> statement-breakpoint

-- Accepting an invitation happens before the invitee has a session or school context, so the
-- runtime role cannot see invitation rows directly. This function consumes a token atomically
-- (single use, unexpired, unrevoked) and returns only the identifiers needed to finish setup.
CREATE OR REPLACE FUNCTION app.consume_invitation(p_token_hash text)
  RETURNS TABLE (user_id uuid, school_id uuid)
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    UPDATE user_invitations i SET accepted_at = now()
    WHERE i.token_hash = p_token_hash
      AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
    RETURNING i.user_id, i.school_id
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.consume_invitation(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.consume_invitation(text) TO app_runtime;
--> statement-breakpoint

-- Runtime privileges. Roles are read-only until custom role editing is built.
GRANT SELECT ON permissions TO app_runtime;
--> statement-breakpoint
GRANT SELECT ON roles TO app_runtime;
--> statement-breakpoint
GRANT SELECT ON role_permissions TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON membership_roles TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON user_invitations TO app_runtime;
--> statement-breakpoint

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membership_roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY roles_tenant ON roles FOR SELECT TO app_runtime USING (app.in_school(school_id));
--> statement-breakpoint
CREATE POLICY role_permissions_tenant ON role_permissions FOR SELECT TO app_runtime
  USING (app.in_school(school_id));
--> statement-breakpoint
CREATE POLICY membership_roles_tenant ON membership_roles FOR ALL TO app_runtime
  USING (app.in_school(school_id))
  WITH CHECK (app.in_school(school_id));
--> statement-breakpoint
CREATE POLICY user_invitations_tenant ON user_invitations FOR ALL TO app_runtime
  USING (app.in_school(school_id))
  WITH CHECK (app.in_school(school_id));
--> statement-breakpoint
-- How many other schools a member of the CURRENT school belongs to (optionally only active
-- memberships). Returns NULL unless the user is a member of the caller's school context, so it
-- cannot be used to probe strangers. Used to decide whether deactivating a membership should
-- also deactivate the account, and whether a school may rename a shared account.
CREATE OR REPLACE FUNCTION app.count_other_memberships(p_user_id uuid, p_school_id uuid, p_active_only boolean)
  RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT CASE
      WHEN p_school_id IS DISTINCT FROM app.current_school_id() THEN NULL
      WHEN NOT EXISTS (
        SELECT 1 FROM school_memberships WHERE user_id = p_user_id AND school_id = p_school_id
      ) THEN NULL
      ELSE (
        SELECT count(*)::int FROM school_memberships
        WHERE user_id = p_user_id AND school_id <> p_school_id
          AND status <> 'removed' AND (NOT p_active_only OR status = 'active')
      )
    END
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.count_other_memberships(uuid, uuid, boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.count_other_memberships(uuid, uuid, boolean) TO app_runtime;
