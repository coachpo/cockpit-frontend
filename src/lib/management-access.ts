export function isManagementActionDisabled({
  busyAction,
  managementKey,
}: {
  busyAction: string | null
  managementKey: string
}): boolean {
  return busyAction !== null || managementKey.trim() === ""
}
