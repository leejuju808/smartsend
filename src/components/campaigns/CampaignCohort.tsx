"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { Select, SelectItem, SelectTrigger } from "@/components/ui/select";

type CohortRow = {
  campaign_id: string;
  sent_day: string;
  sent: number;
  opens: number;
  clicks: number;
  replies: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
};

export function CampaignCohort({ campaignId, days = 14 }: { campaignId: string; days?: number }) {
  const [rows, setRows] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDays, setSelectedDays] = useState(days);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaign-cohort?campaign=${campaignId}&days=${selectedDays}`);
      const data = await res.json();
      if (res.ok && data.rows) {
        let filtered = data.rows.map((r: any) => ({
          ...r,
          sent_day: r.sent_day?.slice(0, 10) || r.sent_day,
        }));
        setRows(filtered);
      }
    } catch (error) {
      console.error("Failed to load cohort data:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000); // Refresh every 15s
    return () => clearInterval(interval);
  }, [campaignId, selectedDays]);

  function exportCSV() {
    if (rows.length === 0) return;
    const headers = ["Date", "Sent", "Opens", "Clicks", "Replies", "Open Rate", "Click Rate", "Reply Rate"];
    const csvRows = [
      headers.join(","),
      ...rows.map((r) =>
        [
          r.sent_day,
          r.sent,
          r.opens,
          r.clicks,
          r.replies,
          `${r.open_rate}%`,
          `${r.click_rate}%`,
          `${r.reply_rate}%`,
        ].join(",")
      ),
    ];
    const csv = csvRows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-cohort-${campaignId}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Daily Cohort (last {selectedDays}d)</div>
          <div className="text-xs text-muted-foreground">Daily performance trends</div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedDays.toString()} onValueChange={(v) => setSelectedDays(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectTrigger>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={rows.length === 0}>
            <Download className="w-4 h-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </div>
      <div className="h-72">
        {loading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Loading...</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <XAxis dataKey="sent_day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="sent" name="Sent" stroke="#8884d8" strokeWidth={2} />
              <Line type="monotone" dataKey="opens" name="Opens" stroke="#82ca9d" strokeWidth={2} />
              <Line type="monotone" dataKey="clicks" name="Clicks" stroke="#ffc658" strokeWidth={2} />
              <Line type="monotone" dataKey="replies" name="Replies" stroke="#ff7300" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {rows.length === 0 && !loading && (
        <div className="text-sm text-muted-foreground text-center py-4">No data yet.</div>
      )}
    </Card>
  );
}

