import { describe, expect, it } from "vitest";

import { buildNavigation, isActive } from "./navigation";

const labels = (groups: ReturnType<typeof buildNavigation>) =>
  groups.flatMap((group) => group.items.map((item) => item.label));

const SCHOOL_ADMIN = [
  "school.settings.manage",
  "branches.read",
  "branches.manage",
  "users.read",
  "users.invite",
  "users.update",
  "users.deactivate",
  "users.assign_roles",
  "audit.read",
] as const;

describe("buildNavigation", () => {
  it("school admin sees users but not platform pages", () => {
    expect(
      labels(
        buildNavigation({ permissions: SCHOOL_ADMIN, hasSchool: true, isPlatformAdmin: false }),
      ),
    ).toEqual(["Dashboard", "Users", "My profile"]);
  });

  it("branch admin with users.read sees users", () => {
    const nav = buildNavigation({
      permissions: ["branches.read", "users.read"],
      hasSchool: true,
      isPlatformAdmin: false,
    });
    expect(labels(nav)).toContain("Users");
  });

  it("teacher sees only the dashboard and their profile", () => {
    expect(
      labels(
        buildNavigation({
          permissions: ["branches.read"],
          hasSchool: true,
          isPlatformAdmin: false,
        }),
      ),
    ).toEqual(["Dashboard", "My profile"]);
  });

  it("platform admin without a school sees platform pages but no school pages", () => {
    expect(
      labels(buildNavigation({ permissions: [], hasSchool: false, isPlatformAdmin: true })),
    ).toEqual(["Dashboard", "Platform overview", "My profile"]);
  });

  it("school pages disappear when no school is selected, whatever the permissions", () => {
    expect(
      labels(
        buildNavigation({ permissions: SCHOOL_ADMIN, hasSchool: false, isPlatformAdmin: false }),
      ),
    ).toEqual(["Dashboard", "My profile"]);
  });

  it("drops empty groups", () => {
    const nav = buildNavigation({ permissions: [], hasSchool: true, isPlatformAdmin: false });
    expect(nav.map((g) => g.label)).toEqual(["Overview", "Account"]);
  });
});

describe("isActive", () => {
  it("matches the dashboard root exactly and other sections by prefix", () => {
    expect(isActive("/dashboard", "/dashboard")).toBe(true);
    expect(isActive("/dashboard/users", "/dashboard")).toBe(false);
    expect(isActive("/dashboard/users/abc", "/dashboard/users")).toBe(true);
    expect(isActive("/dashboard/users-archive", "/dashboard/users")).toBe(false);
  });
});
