export type Role = "owner" | "admin" | "member" | "viewer";

export function canManageCampaigns(role: Role) {
  return role === "owner" || role === "admin" || role === "member";
}

export function canInvite(role: Role) {
  return role === "owner" || role === "admin";
}

export function canManageMembers(role: Role) {
  return role === "owner" || role === "admin";
}

export function canViewAnalytics(role: Role) {
  return role === "owner" || role === "admin" || role === "member";
}

export function canManageBilling(role: Role) {
  return role === "owner" || role === "admin";
}

export function isOwner(role: Role) {
  return role === "owner";
}

export function isAdminOrOwner(role: Role) {
  return role === "owner" || role === "admin";
}

export function hasReadAccess(role: Role) {
  return role === "owner" || role === "admin" || role === "member" || role === "viewer";
} 