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
    expect(labels(buildNavigation(SCHOOL_ADMIN))).toEqual([
      "Dashboard",
      "Branches",
      "Users",
      "School settings",
      "My profile",
    ]);
  });

  it("branch admin sees users but not school settings", () => {
    const nav = labels(buildNavigation(["branches.read", "users.read", "users.invite"]));
    expect(nav).toContain("Users");
    expect(nav).not.toContain("School settings");
  });

  it("teacher sees the dashboard, their branches, and their profile", () => {
    expect(labels(buildNavigation(["branches.read"]))).toEqual([
      "Dashboard",
      "Branches",
      "My profile",
    ]);
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
