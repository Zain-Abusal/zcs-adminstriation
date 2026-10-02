export type AccessLevel = "none" | "read" | "edit" | "manage";
export type AccessAction = "read" | "edit" | "manage";
export type WorkspaceAccess = {
  admin: boolean;
  enabled: boolean;
  grants: Record<string, AccessLevel>;
};
export const accessRank: Record<AccessLevel, number> = { none: 0, read: 1, edit: 2, manage: 3 };
export function permits(
  access: WorkspaceAccess,
  page: string,
  action: AccessAction = "read",
): boolean {
  if (access.admin) return true;
  if (!access.enabled || ["staff", "user_roles"].includes(page)) return false;
  return (accessRank[access.grants[page] || "none"] || 0) >= accessRank[action];
}
export const noAccess: WorkspaceAccess = { admin: false, enabled: false, grants: {} };
