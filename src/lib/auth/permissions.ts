import type { CampaignRole } from "./role";

export function can(role: CampaignRole, perm: "canView" | "canSend" | "canManageMembers" | "canEditTemplates"): boolean {
  switch (perm) {
    case "canView":
      return role === "owner" || role === "sender" || role === "viewer";
    case "canSend":
      return role === "owner" || role === "sender";
    case "canEditTemplates":
      return role === "owner" || role === "sender";
    case "canManageMembers":
      return role === "owner";
    default:
      return false;
  }
}

