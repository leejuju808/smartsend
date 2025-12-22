// src/components/campaigns/FollowupTimelineCard.tsx

import { useFollowupTimeline } from "@/lib/hooks/useFollowupTimeline";
import { Badge } from "@/components/ui/badge";

export function FollowupTimelineCard({ campaignId }: { campaignId: string }) {
  const { timeline, loading } = useFollowupTimeline(campaignId);

  if (loading) {
    return (
      <div className="p-3 border rounded-md text-xs text-muted-foreground">
        Calculating timeline…
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="p-3 border rounded-md text-xs text-muted-foreground">
        Campaign not scheduled or no follow-up steps configured.
      </div>
    );
  }

  return (
    <div className="p-3 border rounded-md space-y-2">
      <div className="text-sm font-medium">Follow-Up Timeline</div>

      {timeline.map((row) => (
        <div
          key={row.step}
          className="flex items-center justify-between text-xs"
        >
          <span>
            Step {row.step}
          </span>

          <Badge variant="secondary" className="text-[10px]">
            {new Date(row.send_at).toLocaleString()}
          </Badge>
        </div>
      ))}
    </div>
  );
}












