"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { switchBranch } from "@/server/auth/request";

/** Change the branch filter. An empty value means all branches in the user's scope. */
export async function switchBranchAction(data: FormData): Promise<void> {
  const value = data.get("branchId");
  const branchId = typeof value === "string" && value.length > 0 ? value : null;
  const ok = await switchBranch(branchId);
  revalidatePath("/dashboard", "layout");
  if (!ok) redirect("/dashboard?error=branch");
  redirect("/dashboard");
}
