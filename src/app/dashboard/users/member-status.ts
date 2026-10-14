import type { StaffMember } from "@/server/modules/users/service";

/** Human-readable status shown as text (never color alone). */
export function staffStatus(member: Pick<StaffMember, "status">) {
  if (member.status === "invited") return { label: "Invitation pending", tone: "warning" as const };
  if (member.status === "active") return { label: "Active", tone: "success" as const };
  return { label: "No access", tone: "danger" as const };
}
