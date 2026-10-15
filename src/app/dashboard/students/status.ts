import type { StudentStatus } from "@/server/modules/students/service";

const LABELS: Record<StudentStatus, string> = {
  enrolled: "Enrolled",
  suspended: "Suspended",
  withdrawn: "Withdrawn",
  graduated: "Graduated",
};

export function statusLabel(status: StudentStatus): string {
  return LABELS[status];
}

export function statusTone(status: StudentStatus): "success" | "warning" | "neutral" {
  if (status === "enrolled") return "success";
  if (status === "suspended") return "warning";
  return "neutral";
}
