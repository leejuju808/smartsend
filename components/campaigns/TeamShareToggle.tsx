"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { shareCampaignToTeam, makeCampaignPrivate } from "@/actions/shareCampaignToTeam";
import { useRouter } from "next/navigation";

type TeamShareToggleProps = {
  campaignId: string;
  visibility: "private" | "team" | null;
  isOwner: boolean;
};

export function TeamShareToggle({ campaignId, visibility, isOwner }: TeamShareToggleProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isShared = visibility === "team";

  async function handleToggle() {
    if (!isOwner) return;
    
    try {
      setLoading(true);
      if (isShared) {
        await makeCampaignPrivate(campaignId);
      } else {
        await shareCampaignToTeam(campaignId);
      }
      router.refresh();
    } catch (error: any) {
      alert(error.message || "Failed to update sharing");
    } finally {
      setLoading(false);
    }
  }

  if (!isOwner) {
    return null;
  }

  return (
    <Button
      variant={isShared ? "default" : "outline"}
      size="sm"
      onClick={handleToggle}
      disabled={loading}
    >
      {loading ? "Updating..." : isShared ? "Team-shared" : "Share with team"}
    </Button>
  );
}


































































