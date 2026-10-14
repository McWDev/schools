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
  it("school admin sees users", () => {
    expect(labels(buildNavigation(SCHOOL_ADMIN))).toEqual(["Dashboard", "Users", "My profile"]);
  });

  it("branch admin with users.read sees users", () => {
    expect(labels(buildNavigation(["branches.read", "users.read"]))).toContain("Users");
  });

  it("teacher sees only the dashboard and their profile", () => {
    expect(labels(buildNavigation(["branches.read"]))).toEqual(["Dashboard", "My profile"]);
  });

  it("drops groups that end up empty", () => {
    expect(buildNavigation([]).map((g) => g.label)).toEqual(["Overview", "Account"]);
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
