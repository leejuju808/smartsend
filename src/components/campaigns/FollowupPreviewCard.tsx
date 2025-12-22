// src/components/campaigns/FollowupPreviewCard.tsx

import { useFollowupPreview } from "@/lib/hooks/useFollowupPreview";
import { Badge } from "@/components/ui/badge";

export function FollowupPreviewCard({ campaignId }: { campaignId: string }) {
  const { data, loading } = useFollowupPreview(campaignId);

  if (loading || !data) {
    return (
      <div className="p-3 border rounded-md text-xs text-muted-foreground">
        Calculating follow-up impact…
      </div>
    );
  }

  return (
    <div className="p-3 border rounded-md space-y-2">
      <div className="text-sm font-medium">Audience Breakdown</div>

      <div className="flex justify-between text-xs">
        <span>Initial Send</span>
        <Badge className="text-xs">{data.step1} leads</Badge>
      </div>

      <div className="flex justify-between text-xs">
        <span>Each Follow-Up</span>
        <Badge variant="outline" className="text-xs">
          {data.nextSteps} leads
        </Badge>
      </div>
    </div>
  );
}

