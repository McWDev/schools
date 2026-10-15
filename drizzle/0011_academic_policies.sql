-- Task 007: academic structure — permissions, role templates, integrity rules, and RLS.

INSERT INTO permissions (code, description) VALUES
  ('academics.read', 'View academic years, terms, grade levels, classes, and sections'),
  ('academics.configure', 'Set up academic years, terms, and grade levels'),
  ('classes.manage', 'Create and edit classes and sections')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;
--> statement-breakpoint

-- Re-define the system role templates with the new permissions, then re-sync every role.
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
              'academics.read','academics.configure','classes.manage']),
      ('branch_admin', 'Branch administrator', 'Manages staff and classes in assigned branches',
        ARRAY['branches.read','users.read','users.invite','users.update','users.deactivate',
              'users.assign_roles','academics.read','classes.manage']),
      ('teacher', 'Teacher', 'Assigned classes and subjects', ARRAY['branches.read','academics.read']),
      ('registrar', 'Registrar', 'Admissions, student records, and class placement',
        ARRAY['branches.read','academics.read','classes.manage']),
      ('finance_officer', 'Finance officer', 'Fees and payments', ARRAY['branches.read','academics.read']),
      ('auditor', 'Auditor', 'Read-only reports and audit log',
        ARRAY['branches.read','users.read','audit.read','academics.read'])
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

-- At most one current academic year.
CREATE UNIQUE INDEX academic_years_single_current ON academic_years (is_current) WHERE is_current;
--> statement-breakpoint

-- A term must fall inside its academic year.
CREATE OR REPLACE FUNCTION app.check_term_within_year() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  year_start date;
  year_end date;
BEGIN
  SELECT starts_on, ends_on INTO year_start, year_end FROM academic_years WHERE id = NEW.academic_year_id;
  IF NEW.starts_on < year_start OR NEW.ends_on > year_end THEN
    RAISE EXCEPTION 'Term dates must fall within the academic year (% to %)', year_start, year_end
      USING ERRCODE = 'check_violation', CONSTRAINT = 'terms_within_year';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER terms_within_year BEFORE INSERT OR UPDATE ON terms
  FOR EACH ROW EXECUTE FUNCTION app.check_term_within_year();
--> statement-breakpoint

CREATE TRIGGER academic_years_touch_updated_at BEFORE UPDATE ON academic_years
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER terms_touch_updated_at BEFORE UPDATE ON terms
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER grade_levels_touch_updated_at BEFORE UPDATE ON grade_levels
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER classes_touch_updated_at BEFORE UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER sections_touch_updated_at BEFORE UPDATE ON sections
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint

-- Runtime privileges: no DELETE anywhere — academic history is archived, never removed.
GRANT SELECT, INSERT, UPDATE ON academic_years, terms, grade_levels, classes, sections TO app_runtime;
--> statement-breakpoint

ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE grade_levels ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- School-wide structure: any signed-in user may read; writes are school-scope only.
CREATE POLICY academic_years_read ON academic_years FOR SELECT TO app_runtime USING (app.has_user());
--> statement-breakpoint
CREATE POLICY academic_years_write ON academic_years FOR ALL TO app_runtime
  USING (app.has_user() AND app.current_scope() = 'school')
  WITH CHECK (app.has_user() AND app.current_scope() = 'school');
--> statement-breakpoint
CREATE POLICY terms_read ON terms FOR SELECT TO app_runtime USING (app.has_user());
--> statement-breakpoint
CREATE POLICY terms_write ON terms FOR ALL TO app_runtime
  USING (app.has_user() AND app.current_scope() = 'school')
  WITH CHECK (app.has_user() AND app.current_scope() = 'school');
--> statement-breakpoint
CREATE POLICY grade_levels_read ON grade_levels FOR SELECT TO app_runtime USING (app.has_user());
--> statement-breakpoint
CREATE POLICY grade_levels_write ON grade_levels FOR ALL TO app_runtime
  USING (app.has_user() AND app.current_scope() = 'school')
  WITH CHECK (app.has_user() AND app.current_scope() = 'school');
--> statement-breakpoint

-- Classes and sections: only inside the branches the user may see.
CREATE POLICY classes_access ON classes FOR ALL TO app_runtime
  USING (app.has_user() AND app.branch_visible(branch_id))
  WITH CHECK (app.has_user() AND app.branch_visible(branch_id));
--> statement-breakpoint
CREATE POLICY sections_access ON sections FOR ALL TO app_runtime
  USING (app.has_user() AND app.branch_visible(branch_id))
  WITH CHECK (app.has_user() AND app.branch_visible(branch_id));
