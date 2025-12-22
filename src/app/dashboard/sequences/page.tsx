"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { createClientComponentClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Lightbulb, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import Link from "next/link";

type GlobalKPIs = {
  totalSent: number;
  delivered: number;
  deliveredRate: number;
  openRate: number;
  replyRate: number;
  clickRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  spamRate: number;
  interestedReplies: number;
  unsubscribes: number;
  spamComplaints: number;
};

type DailyData = {
  date: string;
  sent: number;
  opened: number;
  replied: number;
  clicked: number;
  bounced: number;
  spam: number;
  interested: number;
};

type CampaignPerformance = {
  campaignId: string;
  campaignName: string;
  sent: number;
  openRate: number;
  replyRate: number;
  clickRate: number;
  bounceRate: number;
  interested: number;
};

type StepFunnel = {
  step: number;
  sent: number;
  percentage: number;
};

type InboxPerformance = {
  inboxId: string;
  inboxEmail: string;
  domain: string;
  volume: number;
  openRate: number;
  replyRate: number;
  bounceRate: number;
  spamRate: number;
  healthScore: number;
};

type SDRLeaderboard = {
  sdrId: string;
  sdrName: string;
  assignedLeads: number;
  replies: number;
  interested: number;
  bookedCalls: number;
};

type ICPPerformance = {
  segmentId: string;
  segmentName: string;
  sent: number;
  openRate: number;
  replyRate: number;
  interested: number;
};

type AIInsight = {
  message: string;
  causes: string[];
  actions: string[];
};

export default function SequencesDashboardPage() {
  const [globalKPIs, setGlobalKPIs] = useState<GlobalKPIs | null>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [bestCampaigns, setBestCampaigns] = useState<CampaignPerformance[]>([]);
  const [worstCampaigns, setWorstCampaigns] = useState<CampaignPerformance[]>([]);
  const [stepFunnel, setStepFunnel] = useState<StepFunnel[]>([]);
  const [inboxPerformance, setInboxPerformance] = useState<InboxPerformance[]>([]);
  const [sdrLeaderboard, setSdrLeaderboard] = useState<SDRLeaderboard[]>([]);
  const [icpPerformance, setIcpPerformance] = useState<ICPPerformance[]>([]);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const activeWorkspace =
          typeof window !== "undefined"
            ? localStorage.getItem("active_workspace")
            : null;

        if (activeWorkspace) {
          setWorkspaceId(activeWorkspace);
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: workspace } = await supabase
              .from("workspace_members")
              .select("workspace_id")
              .eq("user_id", user.id)
              .limit(1)
              .maybeSingle();

            if (workspace) {
              setWorkspaceId(workspace.workspace_id);
            }
          }
        }
      } catch (error) {
        console.error("Error loading workspace:", error);
        setLoading(false);
      }
    };

    loadWorkspace();
  }, [supabase]);

  useEffect(() => {
    const loadData = async () => {
      if (!workspaceId) return;

      try {
        setLoading(true);
        const res = await fetch(
          `/api/analytics/sequences?workspace_id=${workspaceId}&days=${days}`
        );
        const data = await res.json();

        setGlobalKPIs(data.globalKPIs);
        setDailyData(data.dailyData || []);
        setBestCampaigns(data.bestCampaigns || []);
        setWorstCampaigns(data.worstCampaigns || []);
        setStepFunnel(data.stepFunnel || []);
        setInboxPerformance(data.inboxPerformance || []);
        setSdrLeaderboard(data.sdrLeaderboard || []);
        setIcpPerformance(data.icpPerformance || []);

        // Generate AI insight (simplified version)
        if (data.globalKPIs) {
          const kpis = data.globalKPIs;
          const insights: string[] = [];
          const causes: string[] = [];
          const actions: string[] = [];

          if (kpis.openRate < 30) {
            insights.push(`Your open rate is ${kpis.openRate.toFixed(1)}%, below the 30% benchmark.`);
            causes.push("Subject lines may need improvement");
            actions.push("Rewrite Step 1 subjects with AI");
          }

          if (kpis.bounceRate > 2) {
            insights.push(`Bounce rate is ${kpis.bounceRate.toFixed(1)}%, above the 2% threshold.`);
            causes.push("Email list quality issues");
            actions.push("Review and clean email list");
          }

          if (kpis.replyRate < 3) {
            insights.push(`Reply rate is ${kpis.replyRate.toFixed(1)}%, below the 3% benchmark.`);
            causes.push("Email content may not be engaging");
            actions.push("Optimize email content with AI");
          }

          if (insights.length > 0) {
            setAiInsight({
              message: insights[0],
              causes,
              actions,
            });
          }
        }

        // Log activity
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from("workspace_activity").insert({
              workspace_id: workspaceId,
              type: "view",
              subtype: "sequence_dashboard",
              actor_id: user.id,
              metadata: { page: "sequences_dashboard" },
            });
          }
        } catch (e) {
          // Activity logging is optional
        }
      } catch (error) {
        console.error("Error loading sequence analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [workspaceId, days, supabase]);

  const getHealthColor = (rate: number, type: "open" | "reply" | "bounce") => {
    if (type === "bounce") {
      if (rate < 2) return "text-green-600";
      if (rate < 5) return "text-yellow-600";
      return "text-red-600";
    }
    if (type === "open") {
      if (rate >= 30) return "text-green-600";
      if (rate >= 20) return "text-yellow-600";
      return "text-red-600";
    }
    if (type === "reply") {
      if (rate >= 3) return "text-green-600";
      if (rate >= 1.5) return "text-yellow-600";
      return "text-red-600";
    }
    return "text-gray-600";
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading sequence performance dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sequence Performance Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Global analytics across all campaigns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Global KPI Cards */}
      {globalKPIs && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total Sent</div>
              <div className="text-2xl font-bold">{globalKPIs.totalSent.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Delivered</div>
              <div className="text-2xl font-bold">
                {globalKPIs.delivered.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">
                ({globalKPIs.deliveredRate.toFixed(1)}%)
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Open Rate</div>
              <div className={`text-2xl font-bold ${getHealthColor(globalKPIs.openRate, "open")}`}>
                {globalKPIs.openRate.toFixed(1)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Reply Rate</div>
              <div className={`text-2xl font-bold ${getHealthColor(globalKPIs.replyRate, "reply")}`}>
                {globalKPIs.replyRate.toFixed(1)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Interested</div>
              <div className="text-2xl font-bold">{globalKPIs.interestedReplies}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Unsubscribes</div>
              <div className="text-2xl font-bold">{globalKPIs.unsubscribes}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Spam</div>
              <div className="text-2xl font-bold">{globalKPIs.spamComplaints}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Bounce Rate</div>
              <div className={`text-2xl font-bold ${getHealthColor(globalKPIs.bounceRate, "bounce")}`}>
                {globalKPIs.bounceRate.toFixed(1)}%
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* AI Insights */}
      {aiInsight && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-600" />
              AI Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-3">{aiInsight.message}</p>
            {aiInsight.causes.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold mb-1">Likely caused by:</div>
                <ul className="list-disc list-inside text-xs text-muted-foreground">
                  {aiInsight.causes.map((cause, i) => (
                    <li key={i}>{cause}</li>
                  ))}
                </ul>
              </div>
            )}
            {aiInsight.actions.length > 0 && (
              <div>
                <div className="text-xs font-semibold mb-1">Suggested Actions:</div>
                <ul className="list-disc list-inside text-xs text-muted-foreground">
                  {aiInsight.actions.map((action, i) => (
                    <li key={i}>{action}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Performance Over Time Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Send Volume (Last {days} days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="sent"
                    name="Sent"
                    stroke="#8884d8"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Open Rate Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="opened"
                    name="Opens"
                    stroke="#82ca9d"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Reply Rate Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="replied"
                    name="Replies"
                    stroke="#ff7300"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Bounce + Spam Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="bounced"
                    name="Bounces"
                    stroke="#ff0000"
                    fill="#ff0000"
                    fillOpacity={0.3}
                  />
                  <Area
                    type="monotone"
                    dataKey="spam"
                    name="Spam"
                    stroke="#ff6b6b"
                    fill="#ff6b6b"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Interested Replies Per Day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="interested"
                    name="Interested"
                    stroke="#10b981"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Best & Worst Campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Campaign</TH>
                  <TH className="text-right">Reply</TH>
                  <TH className="text-right">Open</TH>
                  <TH className="text-right">Interested</TH>
                </TR>
              </THead>
              <TBody>
                {bestCampaigns.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-sm text-muted-foreground">
                      No campaign data available
                    </TD>
                  </TR>
                ) : (
                  bestCampaigns.map((campaign) => (
                    <TR key={campaign.campaignId}>
                      <TD>
                        <Link
                          href={`/dashboard/campaigns/${campaign.campaignId}`}
                          className="hover:underline"
                        >
                          {campaign.campaignName}
                        </Link>
                      </TD>
                      <TD className="text-right font-medium">
                        {campaign.replyRate.toFixed(1)}%
                      </TD>
                      <TD className="text-right">{campaign.openRate.toFixed(0)}%</TD>
                      <TD className="text-right">{campaign.interested}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Underperformers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Campaign</TH>
                  <TH className="text-right">Reply</TH>
                  <TH className="text-right">Open</TH>
                  <TH className="text-right">Bounce</TH>
                </TR>
              </THead>
              <TBody>
                {worstCampaigns.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-sm text-muted-foreground">
                      No campaign data available
                    </TD>
                  </TR>
                ) : (
                  worstCampaigns.map((campaign) => (
                    <TR key={campaign.campaignId}>
                      <TD>
                        <Link
                          href={`/dashboard/campaigns/${campaign.campaignId}`}
                          className="hover:underline"
                        >
                          {campaign.campaignName}
                        </Link>
                      </TD>
                      <TD className="text-right font-medium text-red-600">
                        {campaign.replyRate.toFixed(1)}%
                      </TD>
                      <TD className="text-right">{campaign.openRate.toFixed(0)}%</TD>
                      <TD className="text-right">{campaign.bounceRate.toFixed(1)}%</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Step-Level Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Step-Level Funnel Across All Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Step</TH>
                <TH className="text-right">Sent</TH>
                <TH className="text-right">Percentage</TH>
              </TR>
            </THead>
            <TBody>
              {stepFunnel
                .filter((s) => s.step !== 999)
                .map((step) => (
                  <TR key={step.step}>
                    <TD>Step {step.step}</TD>
                    <TD className="text-right">{step.sent.toLocaleString()}</TD>
                    <TD className="text-right">{step.percentage.toFixed(1)}%</TD>
                  </TR>
                ))}
              {stepFunnel.find((s) => s.step === 999) && (
                <TR className="font-semibold">
                  <TD>Replies</TD>
                  <TD className="text-right">
                    {stepFunnel.find((s) => s.step === 999)?.sent.toLocaleString()}
                  </TD>
                  <TD className="text-right">
                    {stepFunnel.find((s) => s.step === 999)?.percentage.toFixed(1)}%
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* Inbox/Domain Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Inbox / Domain Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Inbox</TH>
                <TH className="text-right">Volume</TH>
                <TH className="text-right">Open</TH>
                <TH className="text-right">Reply</TH>
                <TH className="text-right">Bounce</TH>
                <TH className="text-right">Health Score</TH>
              </TR>
            </THead>
            <TBody>
              {inboxPerformance.length === 0 ? (
                <TR>
                  <TD colSpan={6} className="text-center text-sm text-muted-foreground">
                    No inbox data available
                  </TD>
                </TR>
              ) : (
                inboxPerformance
                  .sort((a, b) => b.healthScore - a.healthScore)
                  .map((inbox) => (
                    <TR key={inbox.inboxId}>
                      <TD>
                        <div>
                          <div className="font-medium">{inbox.inboxEmail}</div>
                          <div className="text-xs text-muted-foreground">{inbox.domain}</div>
                        </div>
                      </TD>
                      <TD className="text-right">{inbox.volume.toLocaleString()}</TD>
                      <TD className="text-right">{inbox.openRate.toFixed(1)}%</TD>
                      <TD className="text-right">{inbox.replyRate.toFixed(1)}%</TD>
                      <TD className="text-right">{inbox.bounceRate.toFixed(1)}%</TD>
                      <TD className={`text-right font-semibold ${getHealthScoreColor(inbox.healthScore)}`}>
                        {inbox.healthScore}
                      </TD>
                    </TR>
                  ))
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* SDR Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">SDR / Owner Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>SDR</TH>
                <TH className="text-right">Assigned Leads</TH>
                <TH className="text-right">Replies</TH>
                <TH className="text-right">Interested</TH>
                <TH className="text-right">Booked Calls</TH>
              </TR>
            </THead>
            <TBody>
              {sdrLeaderboard.length === 0 ? (
                <TR>
                  <TD colSpan={5} className="text-center text-sm text-muted-foreground">
                    No team member data available
                  </TD>
                </TR>
              ) : (
                sdrLeaderboard.map((sdr) => (
                  <TR key={sdr.sdrId}>
                    <TD className="font-medium">{sdr.sdrName}</TD>
                    <TD className="text-right">{sdr.assignedLeads.toLocaleString()}</TD>
                    <TD className="text-right">{sdr.replies}</TD>
                    <TD className="text-right">{sdr.interested}</TD>
                    <TD className="text-right">{sdr.bookedCalls}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* ICP/Segment Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">ICP / Segment Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Segment (ICP)</TH>
                <TH className="text-right">Sent</TH>
                <TH className="text-right">Open</TH>
                <TH className="text-right">Reply</TH>
                <TH className="text-right">Interested</TH>
              </TR>
            </THead>
            <TBody>
              {icpPerformance.length === 0 ? (
                <TR>
                  <TD colSpan={5} className="text-center text-sm text-muted-foreground">
                    No segment data available
                  </TD>
                </TR>
              ) : (
                icpPerformance.map((segment) => (
                  <TR key={segment.segmentId}>
                    <TD className="font-medium">{segment.segmentName}</TD>
                    <TD className="text-right">{segment.sent.toLocaleString()}</TD>
                    <TD className="text-right">{segment.openRate.toFixed(0)}%</TD>
                    <TD className="text-right">{segment.replyRate.toFixed(1)}%</TD>
                    <TD className="text-right">{segment.interested}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
