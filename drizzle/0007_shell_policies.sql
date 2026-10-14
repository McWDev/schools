-- Task 004: branch selection on sessions, and an aggregate view for platform administrators.

-- The selected branch must belong to the selected school. If either changes, the branch filter
-- is cleared rather than left pointing at another school's branch.
ALTER TABLE sessions
  ADD CONSTRAINT sessions_active_branch_fk FOREIGN KEY (active_school_id, active_branch_id)
  REFERENCES branches (school_id, id) ON DELETE SET NULL (active_branch_id);
--> statement-breakpoint
ALTER TABLE sessions
  ADD CONSTRAINT sessions_branch_requires_school CHECK (active_branch_id IS NULL OR active_school_id IS NOT NULL);
--> statement-breakpoint

-- Platform administrators see only aggregate counts of schools by status, never school records.
-- The function checks that the user in the request context is an active platform administrator
-- and returns nothing otherwise.
CREATE OR REPLACE FUNCTION app.platform_school_counts()
  RETURNS TABLE (status text, total integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT s.status::text, count(*)::int
    FROM schools s
    WHERE EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = app.current_user_id() AND u.is_platform_admin AND u.status = 'active'
    )
    GROUP BY s.status
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.platform_school_counts() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.platform_school_counts() TO app_runtime;
