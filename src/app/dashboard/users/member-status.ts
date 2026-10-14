import type { MemberView } from "@/server/modules/users/service";

/** Human-readable status shown as text (never color alone). */
export function memberStatus(member: Pick<MemberView, "membershipStatus" | "userStatus">) {
  if (member.membershipStatus === "suspended")
    return { label: "No access", tone: "danger" as const };
  if (member.userStatus === "invited")
    return { label: "Invitation pending", tone: "warning" as const };
  if (member.userStatus !== "active") return { label: "Account inactive", tone: "danger" as const };
  return { label: "Active", tone: "success" as const };
}
