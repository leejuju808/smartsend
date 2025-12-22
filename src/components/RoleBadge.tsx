"use client";

import { useRole } from "@/hooks/useRole";
import type { CampaignRole } from "@/lib/auth/role";

interface RoleBadgeProps {
  campaignId: string;
  className?: string;
}

const roleLabels: Record<CampaignRole, string> = {
  admin: "Admin ⚡",
  sender: "Sender",
  viewer: "Viewer",
};

const roleColors: Record<CampaignRole, string> = {
  admin: "bg-purple-100 text-purple-700",
  sender: "bg-blue-100 text-blue-700",
  viewer: "bg-gray-100 text-gray-700",
};

export function RoleBadge({ campaignId, className = "" }: RoleBadgeProps) {
  const role = useRole(campaignId);
  
  return (
    <span className={`text-xs rounded-full px-2 py-1 ${roleColors[role]} ${className}`}>
      {roleLabels[role]}
    </span>
  );
}

