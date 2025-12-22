// app/dashboard/ai-sdr/analytics/page.tsx
import { getCampaignStats, getDailyStats } from "@/lib/aiSdrAnalytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/Button";
import Link from "next/link";

export default async function AiSdrAnalyticsPage() {
  const [campaignStats, dailyStats] = await Promise.all([
    getCampaignStats(),
    getDailyStats({ days: 30 }),
  ]);

  const totals = campaignStats?.reduce(
    (acc: any, c: any) => {
      acc.leads += c.total_ai_leads || 0;
      acc.replies += c.leads_with_reply || 0;
      acc.meetings += c.leads_with_meeting || 0;
      acc.closedWon += c.leads_closed_won || 0;
      return acc;
    },
    { leads: 0, replies: 0, meetings: 0, closedWon: 0 },
  ) ?? { leads: 0, replies: 0, meetings: 0, closedWon: 0 };

  const replyRate =
    totals.leads > 0 ? ((totals.replies / totals.leads) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI SDR Analytics</h1>
          <p className="text-sm text-muted-foreground">
            See how Autopilot is performing across campaigns and over time.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/ai-sdr">Back to AI SDR Console</Link>
        </Button>
      </div>

      {/* Top Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="AI SDR Leads"
          value={totals.leads}
          helper="Leads with AI SDR threads"
        />
        <MetricCard
          label="Leads with Replies"
          value={totals.replies}
          helper="At least one inbound email"
        />
        <MetricCard
          label="Overall Reply Rate"
          value={`${replyRate}%`}
          helper="Replies / AI SDR leads"
        />
        <MetricCard
          label="Leads with Meetings"
          value={totals.meetings}
          helper="Leads that reached a meeting"
        />
      </div>

      {/* Daily stats chart (simple v1 as table, you can upgrade to Recharts later) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Last 30 Days — Replies, Meetings, Closes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/60">
                <tr className="text-left">
                  <th className="px-3 py-2">Day</th>
                  <th className="px-3 py-2">Leads w/ Reply</th>
                  <th className="px-3 py-2">AI Sends</th>
                  <th className="px-3 py-2">Revives</th>
                  <th className="px-3 py-2">Meetings</th>
                  <th className="px-3 py-2">Closed Won</th>
                  <th className="px-3 py-2">Closed Lost</th>
                </tr>
              </thead>
              <tbody>
                {dailyStats?.map((d: any) => (
                  <tr key={d.day} className="border-t">
                    <td className="px-3 py-2">
                      {new Date(d.day).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">{d.leads_with_reply}</td>
                    <td className="px-3 py-2">{d.ai_sends}</td>
                    <td className="px-3 py-2">{d.ai_revives}</td>
                    <td className="px-3 py-2">{d.meetings_created}</td>
                    <td className="px-3 py-2">{d.closes_won}</td>
                    <td className="px-3 py-2">{d.closes_lost}</td>
                  </tr>
                ))}
                {(!dailyStats || dailyStats.length === 0) && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-4 text-center text-muted-foreground"
                    >
                      No activity yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Campaign Stats Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Campaign Performance (AI SDR)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/60">
                <tr className="text-left">
                  <th className="px-3 py-2">Campaign</th>
                  <th className="px-3 py-2">AI Leads</th>
                  <th className="px-3 py-2">Leads w/ Reply</th>
                  <th className="px-3 py-2">Reply Rate</th>
                  <th className="px-3 py-2">Leads w/ Meeting</th>
                  <th className="px-3 py-2">Closed Won</th>
                  <th className="px-3 py-2">Closed Lost</th>
                </tr>
              </thead>
              <tbody>
                {campaignStats?.map((c: any) => (
                  <tr key={c.campaign_id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium text-[11px]">
                        {c.campaign_name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Created {new Date(c.campaign_created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-3 py-2">{c.total_ai_leads}</td>
                    <td className="px-3 py-2">{c.leads_with_reply}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">
                        {c.reply_rate_pct ?? 0}%
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{c.leads_with_meeting}</td>
                    <td className="px-3 py-2">{c.leads_closed_won}</td>
                    <td className="px-3 py-2">{c.leads_closed_lost}</td>
                  </tr>
                ))}
                {(!campaignStats || campaignStats.length === 0) && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-4 text-center text-muted-foreground"
                    >
                      No campaigns with AI SDR activity yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}


