import { createClient } from "@/utils/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Separator } from "@/src/components/ui/separator";
import {
  Bot,
  Mail,
  MessageCircle,
  CalendarCheck,
  TrendingUp,
} from "lucide-react";

type DailyMetric = {
  metric_date: string;
  total_ai_sdr_sent: number;
  total_campaign_sent: number;
  total_replies: number;
  total_interested_replies: number;
  meetings_booked: number;
  autopilot_approved: number;
  autopilot_skipped: number;
  autopilot_pending_review: number;
};

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

export default async function SdrMetricsPage() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("sdr_daily_metrics")
    .select("*")
    .order("metric_date", { ascending: true });

  if (error) {
    console.error("sdr_daily_metrics error", error);
  }

  const rows: DailyMetric[] = (data || []) as any;

  const today = new Date();
  const last7Cutoff = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30Cutoff = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const last7 = rows.filter(
    (r) => new Date(r.metric_date) >= last7Cutoff,
  );
  const last30 = rows.filter(
    (r) => new Date(r.metric_date) >= last30Cutoff,
  );

  const lifetime = rows;

  const lifetimeTotals = {
    ai_sdr_sent: sum(lifetime.map((r) => r.total_ai_sdr_sent)),
    campaign_sent: sum(lifetime.map((r) => r.total_campaign_sent)),
    replies: sum(lifetime.map((r) => r.total_replies)),
    interested_replies: sum(
      lifetime.map((r) => r.total_interested_replies),
    ),
    meetings: sum(lifetime.map((r) => r.meetings_booked)),
  };

  const last30Totals = {
    ai_sdr_sent: sum(last30.map((r) => r.total_ai_sdr_sent)),
    replies: sum(last30.map((r) => r.total_replies)),
    interested_replies: sum(
      last30.map((r) => r.total_interested_replies),
    ),
    meetings: sum(last30.map((r) => r.meetings_booked)),
  };

  const aiReplyRate =
    lifetimeTotals.ai_sdr_sent > 0
      ? (lifetimeTotals.replies / lifetimeTotals.ai_sdr_sent) * 100
      : 0;

  const aiMeetingRate =
    lifetimeTotals.ai_sdr_sent > 0
      ? (lifetimeTotals.meetings / lifetimeTotals.ai_sdr_sent) * 100
      : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            AI SDR Metrics
          </h1>
          <p className="text-xs text-muted-foreground">
            See how your AI SDR is performing across sends, replies, and meetings.
          </p>
        </div>
        <Badge
          variant="outline"
          className="border-purple-500/40 bg-purple-500/5 text-[10px] text-purple-500"
        >
          AI SDR Autopilot
        </Badge>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="space-y-2 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">AI SDR emails (30d)</span>
            <Bot className="h-4 w-4 text-purple-500" />
          </div>
          <p className="text-2xl font-semibold">
            {last30Totals.ai_sdr_sent}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Lifetime: {lifetimeTotals.ai_sdr_sent}
          </p>
        </Card>

        <Card className="space-y-2 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">Replies (30d)</span>
            <MessageCircle className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-semibold">
            {last30Totals.replies}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Interested replies: {last30Totals.interested_replies}
          </p>
        </Card>

        <Card className="space-y-2 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">Meetings (lifetime)</span>
            <CalendarCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-semibold">
            {lifetimeTotals.meetings}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Last 30 days: {last30Totals.meetings}
          </p>
        </Card>

        <Card className="space-y-2 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">AI performance</span>
            <TrendingUp className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-sm">
            Reply rate:{" "}
            <span className="font-semibold">
              {aiReplyRate.toFixed(1)}%
            </span>
          </p>
          <p className="text-sm">
            Meeting rate:{" "}
            <span className="font-semibold">
              {aiMeetingRate.toFixed(1)}%
            </span>
          </p>
        </Card>
      </div>

      {/* Daily breakdown table */}
      <Card className="p-4 text-xs">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">
              Daily breakdown (last 30–60 days)
            </h2>
          </div>
          <span className="text-[10px] text-muted-foreground">
            AI vs Campaign, replies, interested, meetings
          </span>
        </div>
        <Separator className="mb-3" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[11px]">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1 text-left">Date</th>
                <th className="py-1 text-right">AI SDR sent</th>
                <th className="py-1 text-right">Campaign sent</th>
                <th className="py-1 text-right">Replies</th>
                <th className="py-1 text-right">Interested</th>
                <th className="py-1 text-right">Meetings</th>
                <th className="py-1 text-right">Approved / Skipped / Pending</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-4 text-center text-[11px] text-muted-foreground"
                  >
                    No data yet. Once emails start sending and replies
                    come in, metrics will appear here.
                  </td>
                </tr>
              ) : (
                rows
                  .slice()
                  .reverse() // newest first
                  .map((r) => (
                    <tr key={r.metric_date} className="border-b last:border-0">
                      <td className="py-1 pr-2 text-left align-top">
                        {new Date(r.metric_date).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        )}
                      </td>
                      <td className="py-1 pr-2 text-right align-top">
                        {r.total_ai_sdr_sent}
                      </td>
                      <td className="py-1 pr-2 text-right align-top">
                        {r.total_campaign_sent}
                      </td>
                      <td className="py-1 pr-2 text-right align-top">
                        {r.total_replies}
                      </td>
                      <td className="py-1 pr-2 text-right align-top">
                        {r.total_interested_replies}
                      </td>
                      <td className="py-1 pr-2 text-right align-top">
                        {r.meetings_booked}
                      </td>
                      <td className="py-1 pl-2 text-right align-top">
                        <span className="inline-flex items-center justify-end gap-1">
                          <span className="text-emerald-500">
                            {r.autopilot_approved}
                          </span>
                          <span className="text-red-500">
                            {r.autopilot_skipped}
                          </span>
                          <span className="text-amber-500">
                            {r.autopilot_pending_review}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

