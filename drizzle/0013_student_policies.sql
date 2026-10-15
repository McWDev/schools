-- Task 008: student records — permissions, role templates, integrity rules, and RLS.

INSERT INTO permissions (code, description) VALUES
  ('students.read', 'View student records in permitted branches'),
  ('students.read_sensitive', 'View student addresses, medical notes, and guardian contact details'),
  ('students.create', 'Admit new students'),
  ('students.update', 'Edit student records, placement, guardians, and status'),
  ('students.transfer', 'Transfer students between branches')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.install_system_roles() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  template record;
BEGIN
  FOR template IN
    SELECT * FROM (VALUES
      ('school_admin', 'School administrator', 'Full access to every branch of the school',
        ARRAY['school.settings.manage','branches.read','branches.manage','users.read','users.invite',
              'users.update','users.deactivate','users.assign_roles','audit.read',
              'academics.read','academics.configure','classes.manage',
              'students.read','students.read_sensitive','students.create','students.update',
              'students.transfer']),
      ('branch_admin', 'Branch administrator', 'Manages staff, classes, and students in assigned branches',
        ARRAY['branches.read','users.read','users.invite','users.update','users.deactivate',
              'users.assign_roles','academics.read','classes.manage',
              'students.read','students.read_sensitive','students.create','students.update',
              'students.transfer']),
      ('teacher', 'Teacher', 'Assigned classes and subjects',
        ARRAY['branches.read','academics.read','students.read']),
      ('registrar', 'Registrar', 'Admissions, student records, and class placement',
        ARRAY['branches.read','academics.read','classes.manage',
              'students.read','students.read_sensitive','students.create','students.update',
              'students.transfer']),
      ('finance_officer', 'Finance officer', 'Fees and payments',
        ARRAY['branches.read','academics.read','students.read']),
      ('auditor', 'Auditor', 'Read-only reports and audit log',
        ARRAY['branches.read','users.read','audit.read','academics.read','students.read'])
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

-- Student numbers are issued once and never change.
CREATE OR REPLACE FUNCTION app.keep_student_number() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.student_number IS DISTINCT FROM OLD.student_number THEN
    RAISE EXCEPTION 'Student numbers cannot be changed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'students_number_immutable';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER students_number_immutable BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION app.keep_student_number();
--> statement-breakpoint
CREATE TRIGGER students_touch_updated_at BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER student_guardians_touch_updated_at BEFORE UPDATE ON student_guardians
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint

-- Possible duplicates across the whole school, as a count only: staff learn that a match exists
-- in another branch without seeing that branch's student.
CREATE OR REPLACE FUNCTION app.count_possible_duplicate_students(
  p_first_name text, p_last_name text, p_date_of_birth date
) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN app.has_user() THEN (
    SELECT count(*)::integer FROM students
    WHERE lower(last_name) = lower(btrim(p_last_name))
      AND lower(first_name) = lower(btrim(p_first_name))
      AND date_of_birth = p_date_of_birth
  ) ELSE 0 END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.count_possible_duplicate_students(text, text, date) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.count_possible_duplicate_students(text, text, date) TO app_runtime;
--> statement-breakpoint

-- Runtime privileges: no DELETE; transfers are append-only.
GRANT SELECT, INSERT, UPDATE ON students, student_guardians TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON student_transfers TO app_runtime;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE student_number_seq TO app_runtime;
--> statement-breakpoint

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE student_guardians ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE student_transfers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- A student (and their guardians) can be read or changed only inside a visible branch. Moving a
-- student to a branch the session cannot see fails the WITH CHECK.
CREATE POLICY students_access ON students FOR ALL TO app_runtime
  USING (app.has_user() AND app.branch_visible(branch_id))
  WITH CHECK (app.has_user() AND app.branch_visible(branch_id));
--> statement-breakpoint
CREATE POLICY student_guardians_access ON student_guardians FOR ALL TO app_runtime
  USING (app.has_user() AND app.branch_visible(branch_id))
  WITH CHECK (app.has_user() AND app.branch_visible(branch_id));
--> statement-breakpoint
CREATE POLICY student_transfers_read ON student_transfers FOR SELECT TO app_runtime
  USING (app.has_user() AND (app.branch_visible(from_branch_id) OR app.branch_visible(to_branch_id)));
--> statement-breakpoint
CREATE POLICY student_transfers_insert ON student_transfers FOR INSERT TO app_runtime
  WITH CHECK (
    app.has_user() AND app.branch_visible(from_branch_id) AND app.branch_visible(to_branch_id)
  );
