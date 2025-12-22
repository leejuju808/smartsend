import { useCampaignAnalytics } from "@/lib/hooks/useCampaignAnalytics";

export function CampaignAnalyticsCard({ campaignId }: { campaignId: string }) {
  const { data, loading } = useCampaignAnalytics(campaignId);

  if (loading || !data) {
    return (
      <div className="p-4 border rounded-md text-xs text-muted-foreground">
        Loading analytics…
      </div>
    );
  }

  const {
    totalSent,
    opens,
    clicks,
    replies,
    bounces,
    unsubs,
  } = data;

  const openRate = totalSent ? ((opens / totalSent) * 100).toFixed(1) : 0;
  const clickRate = totalSent ? ((clicks / totalSent) * 100).toFixed(1) : 0;
  const replyRate = totalSent ? ((replies / totalSent) * 100).toFixed(1) : 0;

  return (
    <div className="p-4 border rounded-md space-y-3">
      <h3 className="text-sm font-medium">Campaign Performance</h3>

      <div className="grid grid-cols-3 gap-3 text-xs">
        
        <div className="space-y-1">
          <div className="font-semibold text-sm">{openRate}%</div>
          <div className="text-muted-foreground">Open Rate</div>
        </div>

        <div className="space-y-1">
          <div className="font-semibold text-sm">{clickRate}%</div>
          <div className="text-muted-foreground">Click Rate</div>
        </div>

        <div className="space-y-1">
          <div className="font-semibold text-sm">{replyRate}%</div>
          <div className="text-muted-foreground">Reply Rate</div>
        </div>

        <div className="space-y-1">
          <div className="font-semibold text-sm">{bounces}</div>
          <div className="text-muted-foreground">Bounces</div>
        </div>

        <div className="space-y-1">
          <div className="font-semibold text-sm">{unsubs}</div>
          <div className="text-muted-foreground">Unsubscribed</div>
        </div>

        <div className="space-y-1">
          <div className="font-semibold text-sm">{totalSent}</div>
          <div className="text-muted-foreground">Total Sent</div>
        </div>
      </div>
    </div>
  );
}

