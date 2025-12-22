// components/campaigns/campaign-share-toggle.tsx
"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Users } from "lucide-react";

type Props = {
  campaignId: string;
  isSharedInitial: boolean;
  isOwner: boolean;
};

export function CampaignShareToggle({
  campaignId,
  isSharedInitial,
  isOwner,
}: Props) {
  const [isShared, setIsShared] = React.useState(isSharedInitial);
  const [loading, setLoading] = React.useState(false);

  const handleChange = async (checked: boolean) => {
    if (!isOwner) return; // just in case

    setLoading(true);
    // optimistic UI
    setIsShared(checked);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/sharing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_shared: checked }),
      });

      if (!res.ok) {
        setIsShared(isSharedInitial);
        console.error(await res.json());
        alert("Failed to update sharing. Try again.");
      }
    } catch (err) {
      console.error(err);
      setIsShared(isSharedInitial);
      alert("Failed to update sharing. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1 text-xs sm:flex-row sm:items-center sm:gap-3">
      <div className="flex items-center gap-2">
        <Badge
          variant={isShared ? "outline" : "secondary"}
          className="inline-flex items-center gap-1"
        >
          <Users className="h-3 w-3" />
          {isShared ? "Shared with workspace" : "Private"}
        </Badge>
        {!isOwner && (
          <span className="text-[10px] text-muted-foreground">
            Only the owner can change sharing.
          </span>
        )}
      </div>

      {isOwner && (
        <div className="flex items-center gap-2">
          <Switch
            id="campaign-sharing"
            checked={isShared}
            disabled={loading}
            onCheckedChange={handleChange}
          />
          <Label
            htmlFor="campaign-sharing"
            className="text-[11px] text-muted-foreground"
          >
            {loading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Updating…
              </span>
            ) : (
              "Share this campaign with workspace"
            )}
          </Label>
        </div>
      )}
    </div>
  );
}

































































