"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Select, SelectTrigger, SelectValue, SelectItem } from "@/components/ui/select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { createClientComponentClient } from "@/lib/supabase";

type CampaignSummary = {
  campaign_id: string;
  name: string;
  total_sent: number;
  total_opens: number;
  total_clicks: number;
  total_replies: number;
  total_meetings: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  meeting_rate: number;
};

type DailyPoint = {
  day: string;
  sent_count: number;
  open_count: number;
  click_count: number;
  reply_count: number;
  meeting_count: number;
};

export default function AnalyticsPage() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        // Get active workspace from localStorage (set by dashboard layout)
        const activeWorkspace = typeof window !== "undefined" 
          ? localStorage.getItem('active_workspace') 
          : null;
        
        if (activeWorkspace) {
          setWorkspaceId(activeWorkspace);
        } else {
          // Fallback: get user's first workspace
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: workspace } = await supabase
              .from('workspace_members')
              .select('workspace_id')
              .eq('user_id', user.id)
              .limit(1)
              .maybeSingle();
            
            if (workspace) {
              setWorkspaceId(workspace.workspace_id);
            }
          }
        }
      } catch (error) {
        console.error('Error loading workspace:', error);
        setLoading(false);
      }
    };

    loadWorkspace();
  }, [supabase]);

  const loadSummary = async () => {
    if (!workspaceId) return;

    try {
      const res = await fetch("/api/analytics/campaigns/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const json = await res.json();
      setCampaigns(json.campaigns || []);
      if (!selectedId && json.campaigns?.length) {
        setSelectedId(json.campaigns[0].campaign_id);
      }
    } catch (error) {
      console.error("Error loading campaign summary:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDaily = async (campaignId: string) => {
    try {
      const res = await fetch(`/api/analytics/campaigns/${campaignId}/daily`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      setDaily(json.points || []);
    } catch (error) {
      console.error("Error loading daily data:", error);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      loadSummary();
    }
  }, [workspaceId]);

  useEffect(() => {
    if (selectedId) loadDaily(selectedId);
  }, [selectedId]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Campaign Analytics</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Campaign performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {campaigns.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No campaigns with data yet.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Campaign</TH>
                  <TH className="text-right">Sent</TH>
                  <TH className="text-right">Open %</TH>
                  <TH className="text-right">Click %</TH>
                  <TH className="text-right">Reply %</TH>
                  <TH className="text-right">Meeting %</TH>
                </TR>
              </THead>
              <TBody>
                {campaigns.map((c) => (
                  <TR
                    key={c.campaign_id}
                    className={
                      selectedId === c.campaign_id
                        ? "bg-muted/60 cursor-pointer"
                        : "cursor-pointer"
                    }
                    onClick={() => setSelectedId(c.campaign_id)}
                  >
                    <TD className="font-medium">
                      {c.name || "Campaign"}
                    </TD>
                    <TD className="text-right">
                      {c.total_sent}
                    </TD>
                    <TD className="text-right">
                      {c.open_rate.toFixed(1)}%
                    </TD>
                    <TD className="text-right">
                      {c.click_rate.toFixed(1)}%
                    </TD>
                    <TD className="text-right">
                      {c.reply_rate.toFixed(1)}%
                    </TD>
                    <TD className="text-right">
                      {c.meeting_rate.toFixed(1)}%
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Daily performance</CardTitle>
            <Select
              value={selectedId || ""}
              onValueChange={(v) => setSelectedId(v)}
            >
              <SelectTrigger className="w-[220px] h-8 text-xs">
                <SelectValue placeholder="Select campaign" />
                {campaigns.map((c) => (
                  <SelectItem key={c.campaign_id} value={c.campaign_id}>
                    {c.name || "Campaign"}
                  </SelectItem>
                ))}
              </SelectTrigger>
            </Select>
          </CardHeader>
          <CardContent className="h-72">
            {daily.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No daily data for this campaign yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily}>
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d) => new Date(d).toLocaleDateString()}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    labelFormatter={(d) => new Date(d).toLocaleDateString()}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="sent_count"
                    name="Sent"
                    dot={false}
                    stroke="#8884d8"
                  />
                  <Line
                    type="monotone"
                    dataKey="open_count"
                    name="Opens"
                    dot={false}
                    stroke="#82ca9d"
                  />
                  <Line
                    type="monotone"
                    dataKey="click_count"
                    name="Clicks"
                    dot={false}
                    stroke="#ffc658"
                  />
                  <Line
                    type="monotone"
                    dataKey="reply_count"
                    name="Replies"
                    dot={false}
                    stroke="#ff7300"
                  />
                  <Line
                    type="monotone"
                    dataKey="meeting_count"
                    name="Meetings"
                    dot={false}
                    stroke="#ff0000"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
