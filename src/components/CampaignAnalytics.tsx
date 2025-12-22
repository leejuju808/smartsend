"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

interface CampaignStats {
  totalSent: number;
  totalReplies: number;
  openRate: number;
  replyRate: number;
  clickRate: number;
  stopOnReplyCount: number;
  dailyStats: Array<{
    date: string;
    sent: number;
    opened: number;
    replied: number;
    clicked: number;
  }>;
  opens: {
    messagesTracked: number;
    messagesOpened: number;
    opensCounted: number;
  };
}

interface CampaignAnalyticsProps {
  campaignId: string;
}

export default function CampaignAnalytics({ campaignId }: CampaignAnalyticsProps) {
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/campaigns/${campaignId}/stats`);
        if (!response.ok) {
          throw new Error('Failed to fetch campaign stats');
        }
        const payload = await response.json();
        const tracking = payload?.tracking ?? { totals: { sent: 0, opened: 0, clicked: 0 }, daily: [] };
        const kpis = payload?.kpis ?? {};

        const totalSent = Number(tracking?.totals?.sent ?? 0);
        const totalOpened = Number(tracking?.totals?.opened ?? 0);
        const totalClicked = Number(tracking?.totals?.clicked ?? 0);
        const totalReplies = Number(kpis?.replied ?? 0);
        const replyRatePct = Number(kpis?.reply_rate_pct ?? 0);
        const openRatePct = Number(kpis?.open_rate ?? 0);
        const clickRatePct = Number(kpis?.click_rate ?? 0);

        const dailyStats = Array.isArray(tracking?.daily)
          ? tracking.daily.map((row: any) => ({
              date: row?.day ?? null,
              sent: Number(row?.sent ?? 0),
              opened: Number(row?.opened ?? 0),
              clicked: Number(row?.clicked ?? 0),
              replied: 0,
            }))
          : [];

        const formatted: CampaignStats = {
          totalSent,
          totalReplies,
          openRate: openRatePct / 100,
          replyRate: replyRatePct / 100,
          clickRate: clickRatePct / 100,
          stopOnReplyCount: totalReplies,
          dailyStats,
          opens: {
            messagesTracked: totalSent,
            messagesOpened: totalOpened,
            opensCounted: totalOpened,
          },
        };

        setStats(formatted);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('Error fetching campaign stats:', err);
      } finally {
        setLoading(false);
      }
    };

    if (campaignId) {
      fetchStats();
    }
  }, [campaignId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-2">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No analytics data available</p>
      </div>
    );
  }

  // Format daily stats for chart
  const chartData = stats.dailyStats.map(day => ({
    date: day.date
      ? new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : "—",
    sent: day.sent,
    replied: day.replied,
    opened: day.opened,
    clicked: day.clicked,
  }));

  return (
    <div className="space-y-6">
      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Emails Sent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalSent}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Open Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{(stats.openRate * 100).toFixed(1)}%</div>
            <p className="text-sm text-gray-500 mt-1">
              {stats.opens?.messagesTracked > 0
                ? `${stats.opens.messagesOpened}/${stats.opens.messagesTracked} messages opened • ${stats.opens.opensCounted} total opens`
                : "No tracked messages yet"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Reply Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{(stats.replyRate * 100).toFixed(1)}%</div>
            <p className="text-sm text-gray-500 mt-1">
              {stats.totalSent > 0
                ? `${stats.totalReplies} replied / ${stats.totalSent} sent`
                : 'No data'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Click Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{(stats.clickRate * 100).toFixed(1)}%</div>
            <p className="text-sm text-gray-500 mt-1">
              {stats.totalSent > 0
                ? `${stats.dailyStats.reduce((acc, day) => acc + day.clicked, 0)} clicks across ${stats.totalSent} messages`
                : "No tracked messages yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Stop-on-Reply Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-gray-500">Stop-on-Reply Count</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{stats.stopOnReplyCount}</div>
          <p className="text-sm text-gray-500 mt-1">
            Leads that received a reply and were automatically stopped
          </p>
        </CardContent>
      </Card>

      {/* Daily Stats Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Daily Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="sent" 
                    stroke="#8884d8" 
                    strokeWidth={2} 
                    dot={false}
                    name="Sent"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="replied" 
                    stroke="#82ca9d" 
                    strokeWidth={2} 
                    dot={false}
                    name="Replied"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="opened" 
                    stroke="#ffc658" 
                    strokeWidth={2} 
                    dot={false}
                    name="Opened"
                  />
                  <Line
                    type="monotone"
                    dataKey="clicked"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={false}
                    name="Clicked"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}