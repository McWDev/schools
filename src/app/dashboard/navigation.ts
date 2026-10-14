import type { PermissionCode } from "@/server/access/permissions";

export type IconName = "home" | "users" | "user";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

interface NavDefinition extends NavItem {
  /** Shown only with this permission. */
  permission?: PermissionCode;
}

const GROUPS: { label: string; items: NavDefinition[] }[] = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: "home" }] },
  {
    label: "People",
    items: [{ href: "/dashboard/users", label: "Users", icon: "users", permission: "users.read" }],
  },
  { label: "Account", items: [{ href: "/dashboard/profile", label: "My profile", icon: "user" }] },
];

/**
 * Navigation for the current user. This is a convenience only: every page, action, and route
 * enforces its own permission checks on the server.
 */
export function buildNavigation(permissions: readonly PermissionCode[]): NavGroup[] {
  return GROUPS.map((group) => ({
    label: group.label,
    items: group.items
      .filter((item) => !item.permission || permissions.includes(item.permission))
      .map(({ href, label, icon }) => ({ href, label, icon })),
  })).filter((group) => group.items.length > 0);
}

/** Whether a nav item is the current page (exact for the dashboard root, prefix otherwise). */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
