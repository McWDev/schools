import type { PermissionCode } from "@/server/tenancy/permissions";

export type IconName = "home" | "users" | "user" | "shield";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

interface NavInput {
  permissions: readonly PermissionCode[];
  hasSchool: boolean;
  isPlatformAdmin: boolean;
}

interface NavDefinition extends NavItem {
  /** Shown only with a selected school and this permission. */
  permission?: PermissionCode;
  requiresSchool?: boolean;
  platformOnly?: boolean;
}

const GROUPS: { label: string; items: NavDefinition[] }[] = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: "home" }] },
  {
    label: "People",
    items: [
      {
        href: "/dashboard/users",
        label: "Users",
        icon: "users",
        permission: "users.read",
        requiresSchool: true,
      },
    ],
  },
  {
    label: "Platform",
    items: [
      {
        href: "/dashboard/platform",
        label: "Platform overview",
        icon: "shield",
        platformOnly: true,
      },
    ],
  },
  { label: "Account", items: [{ href: "/dashboard/profile", label: "My profile", icon: "user" }] },
];

/**
 * Navigation for the current user. This is a convenience only: every page, action, and route
 * enforces its own permission checks on the server.
 */
export function buildNavigation(input: NavInput): NavGroup[] {
  return GROUPS.map((group) => ({
    label: group.label,
    items: group.items
      .filter((item) => !item.platformOnly || input.isPlatformAdmin)
      .filter((item) => !item.requiresSchool || input.hasSchool)
      .filter(
        (item) =>
          !item.permission || (input.hasSchool && input.permissions.includes(item.permission)),
      )
      .map(({ href, label, icon }) => ({ href, label, icon })),
  })).filter((group) => group.items.length > 0);
}

/** Whether a nav item is the current page (exact for the dashboard root, prefix otherwise). */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
