import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

export function CampaignStats({ stats }: { stats: { sent: number; opens: number; clicks: number } }) {
  const openRate = stats.sent ? Math.round((stats.opens / stats.sent) * 100) : 0;
  const clickRate = stats.sent ? Math.round((stats.clicks / stats.sent) * 100) : 0;
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card><CardHeader><CardTitle>Sent</CardTitle></CardHeader><CardContent className="text-3xl">{stats.sent}</CardContent></Card>
      <Card><CardHeader><CardTitle>Opens</CardTitle></CardHeader><CardContent className="text-3xl">{stats.opens} <span className="text-sm text-muted-foreground">({openRate}%)</span></CardContent></Card>
      <Card><CardHeader><CardTitle>Clicks</CardTitle></CardHeader><CardContent className="text-3xl">{stats.clicks} <span className="text-sm text-muted-foreground">({clickRate}%)</span></CardContent></Card>
    </div>
  );
}

