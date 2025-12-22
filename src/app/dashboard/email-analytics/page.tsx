"use client";

import useSWR from "swr";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { CampaignSelect } from "@/components/CampaignSelect";

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function EmailAnalyticsPage() {
  const [campaignId, setCampaignId] = useState<string | null>(null);

  // sync with URL
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("campaignId");
    setCampaignId(id);
  }, []);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (campaignId) sp.set("campaignId", campaignId); else sp.delete("campaignId");
    const qs = sp.toString();
    const url = qs ? `?${qs}` : "";
    window.history.replaceState(null, "", url);
  }, [campaignId]);

  const apiUrl = useMemo(
    () => `/api/analytics/email${campaignId ? `?campaignId=${campaignId}` : ""}`,
    [campaignId]
  );

  const { data, error, isLoading } = useSWR(apiUrl, fetcher, { refreshInterval: 30_000 });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Email Analytics</h1>
          <CampaignSelect value={campaignId} onChange={setCampaignId} />
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="text-sm text-muted-foreground">Loading analytics...</div>
        </div>
      </div>
    );
  }

  if (error || !data?.ok) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Email Analytics</h1>
          <CampaignSelect value={campaignId} onChange={setCampaignId} />
        </div>
        <div className="text-red-600">Error loading analytics: {error || data?.error}</div>
      </div>
    );
  }

  const { daily, domains } = data;

  // Calculate totals
  const totals = daily?.reduce((acc: any, day: any) => ({
    sent: acc.sent + (day.sent || 0),
    delivered: acc.delivered + (day.delivered || 0),
    bounced: acc.bounced + (day.bounced || 0),
    opens: acc.opens + (day.opens || 0),
    clicks: acc.clicks + (day.clicks || 0),
  }), { sent: 0, delivered: 0, bounced: 0, opens: 0, clicks: 0 }) || { sent: 0, delivered: 0, bounced: 0, opens: 0, clicks: 0 };

  const deliveryRate = totals.sent > 0 ? ((totals.delivered / totals.sent) * 100).toFixed(1) : "0.0";
  const bounceRate = totals.sent > 0 ? ((totals.bounced / totals.sent) * 100).toFixed(1) : "0.0";
  const openRate = totals.delivered > 0 ? ((totals.opens / totals.delivered) * 100).toFixed(1) : "0.0";
  const clickRate = totals.delivered > 0 ? ((totals.clicks / totals.delivered) * 100).toFixed(1) : "0.0";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Email Analytics</h1>
        <CampaignSelect value={campaignId} onChange={setCampaignId} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.sent}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.delivered}</div>
            <p className="text-xs text-muted-foreground">{deliveryRate}% delivery rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Opens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.opens}</div>
            <p className="text-xs text-muted-foreground">{openRate}% open rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Clicks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.clicks}</div>
            <p className="text-xs text-muted-foreground">{clickRate}% click rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Metrics Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Email Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={daily}>
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="sent" stackId="1" stroke="#8884d8" fill="#8884d8" name="Sent" />
              <Area type="monotone" dataKey="delivered" stackId="1" stroke="#82ca9d" fill="#82ca9d" name="Delivered" />
              <Area type="monotone" dataKey="opens" stackId="2" stroke="#ffc658" fill="#ffc658" name="Opens" />
              <Area type="monotone" dataKey="clicks" stackId="2" stroke="#ff7300" fill="#ff7300" name="Clicks" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Domain Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Top Domains (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {domains?.slice(0, 10).map((domain: any, index: number) => (
              <div key={domain.domain} className="flex items-center justify-between py-2 border-b last:border-b-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{domain.domain}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{domain.total} sent</span>
                  <span>{domain.delivered} delivered</span>
                  <span className="text-red-600">{domain.bounced} bounced</span>
                </div>
              </div>
            ))}
            {(!domains || domains.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                No domain data available
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}