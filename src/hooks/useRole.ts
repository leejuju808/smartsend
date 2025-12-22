"use client";

import { useEffect, useState } from "react";
import type { CampaignRole } from "@/lib/auth/role";

export function useRole(campaignId?: string): CampaignRole {
  const [role, setRole] = useState<CampaignRole>("viewer");

  useEffect(() => {
    if (!campaignId) return;
    
    const stored = localStorage.getItem(`campaign_role_${campaignId}`);
    if (stored) {
      setRole(stored as CampaignRole);
    } else {
      // Fetch role from API if not in localStorage
      fetch(`/api/campaigns/${campaignId}/role`)
        .then((res) => res.json())
        .then((data) => {
          if (data.role) {
            setRole(data.role);
            localStorage.setItem(`campaign_role_${campaignId}`, data.role);
          }
        })
        .catch(() => {
          // Fallback to viewer on error
          setRole("viewer");
        });
    }
  }, [campaignId]);

  return role;
}

