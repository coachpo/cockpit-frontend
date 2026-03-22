import type { AuthFile } from "@/types/management"

export function getAuthFileStatusLabel(file: Pick<AuthFile, "disabled" | "status">): string {
  if (file.disabled) {
    return "disabled"
  }

  const status = typeof file.status === "string" ? file.status.trim() : ""
  return status !== "" ? status : "active"
}
