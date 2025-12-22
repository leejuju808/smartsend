"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ShareDrawer } from "@/components/campaign/ShareDrawer";

export default function ShareCampaignSection({ campaignId }: { campaignId: string }) {
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setShareOpen(true)}>Share</Button>
      <ShareDrawer
        campaignId={campaignId}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </>
  );
}
