"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

type Row = {
  campaign_id: string;
  campaign_name: string;
  owner_id: string;
  workspace_id: string | null;
  emails_sent: number;
  opens: number;
  clicks: number;
  open_rate_pct: number;
  click_rate_pct: number;
  last_activity_at: string | null;
};

export default function EngagementClient() {
  const supabase = createClientComponentClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    const loadWorkspaceAndData = async () => {
      try {
        // Get active workspace from localStorage (set by dashboard layout)
        const activeWorkspace = localStorage.getItem('active_workspace');
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
              .single();
            
            if (workspace) {
              setWorkspaceId(workspace.workspace_id);
            }
          }
        }
      } catch (error) {
        console.error('Error loading workspace:', error);
      }
    };

    loadWorkspaceAndData();
  }, [supabase]);

  useEffect(() => {
    if (!workspaceId) return;

    const load = async () => {
      const { data, error } = await supabase
        .from("campaign_metrics")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("last_activity_at", { ascending: false });
      if (!error && data) setRows(data as unknown as Row[]);
    };
    load();

    // Live updates when email_logs change (opens/clicks)
    const channel = supabase
      .channel("realtime-engagement")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_logs" },
        () => {
          // naive reload; you can diff-update for scale
          (async () => {
            const { data } = await supabase
              .from("campaign_metrics")
              .select("*")
              .eq("workspace_id", workspaceId)
              .order("last_activity_at", { ascending: false });
            setRows((data || []) as Row[]);
          })();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, workspaceId]);

  const filtered = rows.filter(r =>
    r.campaign_name.toLowerCase().includes(filter.toLowerCase())
  );

  const chartData = filtered.map(r => ({
    name: r.campaign_name.length > 20 ? r.campaign_name.substring(0, 20) + '...' : r.campaign_name,
    OpenRate: r.open_rate_pct,
    ClickRate: r.click_rate_pct,
  }));

  const totals = filtered.reduce(
    (acc, r) => {
      acc.sent += r.emails_sent || 0;
      acc.opens += r.opens || 0;
      acc.clicks += r.clicks || 0;
      return acc;
    },
    { sent: 0, opens: 0, clicks: 0 }
  );

  const overallOpen = totals.sent ? +(totals.opens / totals.sent * 100).toFixed(2) : 0;
  const overallClick = totals.sent ? +(totals.clicks / totals.sent * 100).toFixed(2) : 0;

  if (!workspaceId) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-gray-600">Please select a workspace to view engagement metrics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold">Engagement Metrics</h1>
        <Input
          placeholder="Filter by campaign…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full md:w-64"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Total Sent</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{totals.sent}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Overall Open Rate</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{overallOpen}%</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Overall Click Rate</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{overallClick}%</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Campaign Table</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Campaign</TH>
                <TH className="text-right">Sent</TH>
                <TH className="text-right">Opens</TH>
                <TH className="text-right">Clicks</TH>
                <TH className="text-right">Open %</TH>
                <TH className="text-right">Click %</TH>
                <TH className="text-right">Last Activity</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.length === 0 ? (
                <TR>
                  <TD colSpan={7} className="text-center py-8 text-gray-500">
                    No campaigns found. Start sending emails to see engagement metrics here.
                  </TD>
                </TR>
              ) : (
                filtered.map((r) => (
                  <TR key={r.campaign_id}>
                    <TD className="font-medium">{r.campaign_name}</TD>
                    <TD className="text-right">{r.emails_sent}</TD>
                    <TD className="text-right">{r.opens}</TD>
                    <TD className="text-right">{r.clicks}</TD>
                    <TD className="text-right">{r.open_rate_pct}%</TD>
                    <TD className="text-right">{r.click_rate_pct}%</TD>
                    <TD className="text-right">
                      {r.last_activity_at ? new Date(r.last_activity_at).toLocaleString() : "—"}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {filtered.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Open vs Click Rates</CardTitle></CardHeader>
          <CardContent className="w-full h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="OpenRate" fill="#8884d8" name="Open Rate %" />
                <Bar dataKey="ClickRate" fill="#82ca9d" name="Click Rate %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
