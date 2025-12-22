"use client"

import useSWR from "swr"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts"

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface StatData {
  campaign_id: string;
  total_events: number;
  sent: number;
  delivered: number;
  opened: number;
  replied: number;
  day: string;
}

interface EmailStatsResponse {
  stats: StatData[];
}

export default function EmailActivity({ campaignId }: { campaignId: string }) {
  const { data, error, isLoading } = useSWR<EmailStatsResponse>(
    `/api/campaigns/${campaignId}/email-stats`, 
    fetcher, 
    { refreshInterval: 5000 }
  );
  
  const stats = data?.stats ?? [];
  
  const totals = stats.reduce((acc, d) => ({
    sent: (acc.sent || 0) + (d.sent || 0),
    delivered: (acc.delivered || 0) + (d.delivered || 0),
    opened: (acc.opened || 0) + (d.opened || 0),
    replied: (acc.replied || 0) + (d.replied || 0),
  }), {} as Record<string, number>);

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">Email Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">Loading email activity...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">Email Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-500">Error loading email activity</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <CardTitle className="text-xl">Email Activity</CardTitle>
        <div className="grid grid-cols-4 gap-3 text-center">
          <Stat k="Sent" v={totals.sent || 0} />
          <Stat k="Delivered" v={totals.delivered || 0} />
          <Stat k="Opened" v={totals.opened || 0} />
          <Stat k="Replied" v={totals.replied || 0} />
        </div>
      </CardHeader>
      <CardContent className="h-64">
        {stats.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            No email activity data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.map(d => ({ 
              day: new Date(d.day).toLocaleDateString(), 
              sent: d.sent, 
              delivered: d.delivered, 
              opened: d.opened, 
              replied: d.replied 
            }))}>
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="sent" stroke="#8884d8" fill="#8884d8" strokeOpacity={0.9} fillOpacity={0.2} />
              <Area type="monotone" dataKey="delivered" stroke="#82ca9d" fill="#82ca9d" strokeOpacity={0.9} fillOpacity={0.2} />
              <Area type="monotone" dataKey="opened" stroke="#ffc658" fill="#ffc658" strokeOpacity={0.9} fillOpacity={0.2} />
              <Area type="monotone" dataKey="replied" stroke="#ff7c7c" fill="#ff7c7c" strokeOpacity={0.9} fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ k, v }: { k: string; v: number }) {
  return (
    <div className="rounded-2xl border p-2">
      <div className="text-xs opacity-70">{k}</div>
      <div className="text-lg font-semibold">{v}</div>
    </div>
  )
} 