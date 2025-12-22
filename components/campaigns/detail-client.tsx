"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { FollowUpSequenceModal } from "@/components/followup/sequence-modal";
import { CampaignReview } from "@/components/campaigns/CampaignReview";
import { CampaignStatsCards } from "@/components/campaigns/campaign-stats-cards";
import { CampaignMoneyFollowUpTab } from "@/components/campaigns/campaign-money-follow-up-tab";
import type { LaunchReadiness, LaunchIssue } from "@/lib/smartsend/getCampaignLaunchReadiness";
import { startCampaign } from "@/actions/startCampaign";
import { shareCampaignByEmail } from "@/actions/shareCampaign";
import { removeCampaignShare } from "@/actions/removeCampaignShare";

type EmailAccount = {
  id: string;
  provider: "gmail" | "outlook";
  email?: string;
  account_email?: string;
  display_name: string | null;
};

type SequenceStep = {
  step: number;
  subject: string;
  body: string;
  delayDays: number;
};

type Campaign = {
  id: string;
  name: string;
  objective: string | null;
  status: string;
  audience_type: string | null;
  segment_id: string | null;
  daily_send_cap: number | null;
  sending_window_start: string | null;
  sending_window_end: string | null;
  start_date: string | null;
  timezone: string | null;
  sequence: SequenceStep[] | null;
  created_at: string;
  over_quota?: boolean;
  email_accounts?: EmailAccount | null;
};

type CampaignEvent = {
  id: string;
  type: string;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  created_at: string;
};

type Stats = {
  sent: number;
  opens: number;
  replies: number;
  meetings: number;
};

type Metrics = {
  total_sent: number;
  total_delivered: number;
  unique_opens: number;
  unique_clicks: number;
  unique_replies: number;
  total_bounces: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
} | null;

type AccessRole = "owner" | "editor" | "viewer";

type ShareRow = {
  id: string;
  user_id: string;
  role: "viewer" | "editor";
  created_at: string;
  user?: { email: string | null } | null;
};

type PerformanceData = {
  campaign_id: string;
  workspace_id: string;
  name: string;
  created_at: string;
  emails_sent: number;
  emails_failed: number;
  replies: number;
  hot: number;
  warm: number;
  not_interested: number;
  pipeline_value: number;
} | null;

type DailyStat = {
  day: string;
  reply_count: number;
};

type Props = {
  campaign: Campaign;
  events: CampaignEvent[];
  stats: Stats;
  metrics?: Metrics;
  performance?: PerformanceData;
  dailyStats?: DailyStat[];
  initialReadiness?: LaunchReadiness;
  accessRole?: AccessRole;
  initialShares?: ShareRow[];
};

export function CampaignDetailClient({ 
  campaign, 
  events, 
  stats,
  metrics,
  performance,
  dailyStats = [],
  initialReadiness,
  accessRole = "owner",
  initialShares = []
}: Props) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState(campaign.status);
  const [loadingAction, setLoadingAction] = useState<"launch" | "pause" | "complete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followUpSteps, setFollowUpSteps] = useState<Array<{ subject: string; body: string }> | null>(null);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [generatingFollowUp, setGeneratingFollowUp] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [readiness, setReadiness] = useState<LaunchReadiness | undefined>(initialReadiness);
  const [isPending, startTransition] = useTransition();
  const [shares, setShares] = useState<ShareRow[]>(initialShares);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [isSharing, startShareTransition] = useTransition();

  const canLaunch = ["draft", "paused"].includes(currentStatus);
  const canPause = ["scheduled", "running"].includes(currentStatus);
  const canComplete = ["scheduled", "running", "paused"].includes(currentStatus);
  const hasError = readiness?.issues.some((i) => i.level === "error") ?? false;
  const canEdit = accessRole === "owner" || accessRole === "editor";

  const handleStart = async () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await startCampaign(campaign.id);
        if (res.readiness) setReadiness(res.readiness);
        if (res.ok) {
          setCurrentStatus("running");
          router.refresh();
        }
      } catch (e: any) {
        // Check if error is related to email cap
        const errorMessage = e.message || "";
        if (
          errorMessage.includes("email cap") ||
          errorMessage.includes("EMAIL_CAP_REACHED") ||
          errorMessage.includes("monthly limit")
        ) {
          router.push("/dashboard/billing");
          return;
        }
        setError(errorMessage || "Failed to start campaign.");
      }
    });
  };

  const handleStatusAction = async (action: "launch" | "pause" | "complete") => {
    if (action === "launch") {
      handleStart();
      return;
    }
    setLoadingAction(action);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update campaign status.");
        setLoadingAction(null);
        return;
      }
      setCurrentStatus(data.status);
      setLoadingAction(null);
      // Refresh page data (events, etc.)
      router.refresh();
    } catch (e) {
      console.error(e);
      setError("Something went wrong while updating status.");
      setLoadingAction(null);
    }
  };

  const statusColor =
    currentStatus === "running"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : currentStatus === "scheduled"
      ? "bg-blue-100 text-blue-700 border-blue-200"
      : currentStatus === "paused"
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : currentStatus === "completed"
      ? "bg-slate-100 text-slate-700 border-slate-200"
      : "bg-muted text-muted-foreground border-muted-foreground/30";

  const sender = campaign.email_accounts;
  const senderEmail = sender?.email || sender?.account_email || "";
  
  const audienceLabel =
    campaign.audience_type === "all_leads"
      ? "All leads"
      : campaign.audience_type === "segment"
      ? "Segment"
      : campaign.audience_type === "manual"
      ? "Manual selection"
      : "Unknown";

  const sequence = campaign.sequence ?? [];

  const generateFollowUpSequence = async () => {
    setGeneratingFollowUp(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/followup/sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaign.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to generate follow-up sequence.");
        setGeneratingFollowUp(false);
        return;
      }
      setFollowUpSteps(data.steps);
      setShowFollowUpModal(true);
      setGeneratingFollowUp(false);
    } catch (e) {
      console.error(e);
      setError("Something went wrong while generating follow-up sequence.");
      setGeneratingFollowUp(false);
    }
  };

  async function handleShare() {
    setShareError(null);
    const email = shareEmail.trim();
    if (!email) {
      setShareError("Enter an email to share with.");
      return;
    }

    startShareTransition(async () => {
      try {
        await shareCampaignByEmail(campaign.id, email, "editor");
        // Optimistically add it; or revalidate via refresh if you want.
        setShares((prev) => [
          {
            id: crypto.randomUUID(),
            user_id: "pending",
            role: "editor",
            created_at: new Date().toISOString(),
            user: { email },
          },
          ...prev,
        ]);
        setShareEmail("");
        router.refresh();
      } catch (e: any) {
        setShareError(e.message || "Failed to share campaign.");
      }
    });
  }

  async function handleRemoveShare(userId: string) {
    startShareTransition(async () => {
      try {
        await removeCampaignShare(campaign.id, userId);
        setShares((prev) => prev.filter((s) => s.user_id !== userId));
        router.refresh();
      } catch (e) {
        console.error(e);
        setShareError("Failed to remove share.");
      }
    });
  }

  return (
    <div className="min-h-screen bg-background flex items-start justify-center">
      <div className="w-full max-w-5xl px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1">
            <button
              onClick={() => router.push("/campaigns")}
              className="text-[0.7rem] text-muted-foreground hover:underline mb-1"
            >
              ← Back to city outreach
            </button>
            <h1 className="text-xl font-semibold">{campaign.name}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>City outreach ID: {campaign.id.slice(0, 8)}…</span>
              <span>•</span>
              <span>
                Created{" "}
                {new Date(campaign.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
          <div className="flex flex-col md:items-end gap-2">
            <Badge className={cn("text-xs border", statusColor)}>
              {currentStatus.toUpperCase()}
            </Badge>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowReviewModal(true)}
              >
                Review city outreach
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!canPause || loadingAction === "pause"}
                onClick={() => handleStatusAction("pause")}
              >
                {loadingAction === "pause" ? "Pausing…" : "Pause"}
              </Button>
              <Button
                size="sm"
                disabled={isPending || hasError || !canLaunch || loadingAction === "launch" || accessRole === "viewer"}
                onClick={() => handleStatusAction("launch")}
              >
                {isPending || loadingAction === "launch"
                  ? "Launching…"
                  : currentStatus === "running"
                  ? "Outreach running"
                  : accessRole === "viewer"
                  ? "View only"
                  : currentStatus === "draft"
                  ? "Start city outreach"
                  : "Resume"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canComplete || loadingAction === "complete"}
                onClick={() => handleStatusAction("complete")}
              >
                {loadingAction === "complete" ? "Marking…" : "Mark complete"}
              </Button>
            </div>
          </div>
        </div>

        {/* Block 15700: Review Banner for non-launched campaigns */}
        {currentStatus === "draft" && (
          <div className="border rounded-xl p-3 bg-yellow-50 text-[11px] flex items-center justify-between">
            <span>This city outreach has not been launched yet.</span>
            <button
              className="px-3 py-1 rounded-xl bg-black text-white text-xs font-semibold hover:bg-gray-800"
              onClick={() => router.push(`/campaigns/${campaign.id}/review`)}
            >
              Review & Launch
            </button>
          </div>
        )}

        {error && (
          <div className="text-xs text-destructive border border-destructive/40 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {/* Stats cards */}
        <CampaignStatsCards metrics={metrics ?? null} />

        {/* Block 8690: Campaign Performance Dashboard */}
        {performance && (
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label="Homeowners contacted"
                value={performance.emails_sent ?? 0}
              />
              <StatCard
                label="Homeowners responding"
                value={performance.replies ?? 0}
              />
              <StatCard
                label="Hot leads"
                value={performance.hot ?? 0}
              />
              <StatCard
                label="Warm leads"
                value={performance.warm ?? 0}
              />
              <StatCard
                label="Not interested"
                value={performance.not_interested ?? 0}
              />
              <StatCard
                label="Pipeline value"
                value={
                  performance.pipeline_value && Number(performance.pipeline_value) > 0
                    ? `$${Number(performance.pipeline_value).toLocaleString()}`
                    : "$0"
                }
              />
            </section>

            {/* Daily Performance Trend */}
            {dailyStats.length > 0 && (
              <section className="mt-6 rounded-2xl border bg-card p-4 text-xs">
                <p className="text-sm font-medium mb-2">Daily activity</p>
                <div className="h-24 flex items-end gap-1">
                  {(() => {
                    const maxReplies = Math.max(...dailyStats.map(s => s.reply_count), 1);
                    return dailyStats.map((d) => {
                      const heightPercent = maxReplies > 0 ? (d.reply_count / maxReplies) * 100 : 0;
                      return (
                        <div
                          key={d.day}
                          className="flex-1 bg-primary/30 rounded-t hover:bg-primary/50 transition-colors"
                          style={{ height: `${Math.max(heightPercent, 5)}%` }}
                          title={`${d.reply_count} responses on ${d.day}`}
                        />
                      );
                    });
                  })()}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Launch checklist */}
        {readiness && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Launch checklist</p>
              <span
                className={
                  "text-[11px] px-2 py-[2px] rounded-full " +
                  (hasError
                    ? "bg-red-100 text-red-700"
                    : "bg-green-100 text-green-700")
                }
              >
                {hasError ? "Not ready" : "Ready to launch"}
              </span>
            </div>

            <ul className="space-y-1 text-xs">
              {readiness.issues.map((issue: LaunchIssue) => (
                <li key={issue.code} className="flex items-start gap-2">
                  <span className="mt-[2px]">
                    {issue.level === "error" ? "⛔" : issue.level === "warning" ? "⚠️" : "✅"}
                  </span>
                  <span>{issue.message}</span>
                </li>
              ))}
              {readiness.issues.length === 0 && (
                <li className="flex items-start gap-2">
                  <span className="mt-[2px]">✅</span>
                  <span>Everything looks good. You can start this campaign safely.</span>
                </li>
              )}
            </ul>

            {error && (
              <p className="text-[11px] text-red-600 whitespace-pre-line">{error}</p>
            )}
          </Card>
        )}

        {/* Team & Sharing */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Team &amp; sharing</p>
            <p className="text-[11px] text-muted-foreground">
              {accessRole === "owner" 
                ? "Owner can invite teammates to collaborate on this campaign."
                : `Your access: ${accessRole}`}
            </p>
          </div>

          {accessRole === "owner" && (
            <div className="space-y-2">
              <div className="flex gap-2 text-xs">
                <Input
                  className="h-8 text-xs"
                  placeholder="teammate@example.com"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isSharing) {
                      handleShare();
                    }
                  }}
                />
                <Button
                  size="sm"
                  onClick={handleShare}
                  disabled={isSharing}
                >
                  {isSharing ? "Sharing..." : "Share as editor"}
                </Button>
              </div>
              {shareError && (
                <p className="text-[11px] text-red-600">{shareError}</p>
              )}
            </div>
          )}

          <div className="border rounded max-h-60 overflow-y-auto text-xs mt-2">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">User</th>
                  <th className="p-2 text-left">Role</th>
                  {accessRole === "owner" && <th className="p-2 text-left">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {/* Owner row */}
                <tr className="border-t">
                  <td className="p-2">
                    <span className="font-medium">You (owner)</span>
                  </td>
                  <td className="p-2 text-[11px]">owner</td>
                  {accessRole === "owner" && <td className="p-2 text-[11px]">—</td>}
                </tr>
                {/* Shared teammates */}
                {shares.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-2">
                      <span className="font-medium">
                        {s.user?.email || "Unknown user"}
                      </span>
                    </td>
                    <td className="p-2 text-[11px]">{s.role}</td>
                    {accessRole === "owner" && (
                      <td className="p-2 text-[11px]">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemoveShare(s.user_id)}
                          disabled={isSharing}
                          className="h-6 text-[10px] px-2"
                        >
                          Remove
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
                {shares.length === 0 && (
                  <tr className="border-t">
                    <td className="p-2 text-[11px] text-muted-foreground" colSpan={accessRole === "owner" ? 3 : 2}>
                      No teammates yet. Share this city outreach to collaborate.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Block 335: Over Quota Banner */}
        {campaign.over_quota && (
          <div className="mb-4 rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            <div className="font-semibold text-[11px]">
              Outreach paused: billing quota reached
            </div>
            <div className="text-[11px] text-amber-200/90">
              This city outreach hit your daily contact limit. Outreach resumes automatically
              when your quota resets, or after you upgrade your plan.
            </div>
          </div>
        )}

        {/* Tabs: Overview and Money + Follow-Up */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="money">Money + Follow-Up</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            {/* Top grid: Overview + Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {campaign.objective && (
                <div className="space-y-1">
                  <div className="text-[0.7rem] font-medium">Objective</div>
                  <p className="text-[0.7rem] text-muted-foreground whitespace-pre-line">
                    {campaign.objective}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <OverviewRow label="Sender">
                  {sender ? (
                    <>
                      {sender.display_name ?? senderEmail}{" "}
                      <span className="text-muted-foreground">
                        ({sender.provider === "gmail" ? "Gmail" : "Outlook"})
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </OverviewRow>

                <OverviewRow label="Audience">
                  <span>{audienceLabel}</span>
                </OverviewRow>

                <OverviewRow label="Start date">
                  {campaign.start_date ? (
                    <>
                      {new Date(campaign.start_date).toLocaleDateString()}{" "}
                      <span className="text-muted-foreground text-[0.65rem]">
                        {campaign.timezone ?? ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not scheduled</span>
                  )}
                </OverviewRow>

                <OverviewRow label="Daily cap">
                  {campaign.daily_send_cap ? (
                    <>{campaign.daily_send_cap.toLocaleString()} homeowners/day</>
                  ) : (
                    <span className="text-muted-foreground">Default workspace cap</span>
                  )}
                </OverviewRow>

                <OverviewRow label="Send window">
                  {campaign.sending_window_start && campaign.sending_window_end ? (
                    <>
                      {campaign.sending_window_start.slice(0, 5)} –{" "}
                      {campaign.sending_window_end.slice(0, 5)}{" "}
                      <span className="text-muted-foreground text-[0.65rem]">
                        {campaign.timezone ?? ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Workspace default</span>
                  )}
                </OverviewRow>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Performance (coming soon)</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-xs">
              <StatBox label="Sent" value={stats.sent} />
              <StatBox label="Opens" value={stats.opens} />
              <StatBox label="Replies" value={stats.replies} />
              <StatBox label="Meetings" value={stats.meetings} />
            </CardContent>
          </Card>
        </div>

        {/* Sequence + Timeline */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Sequence</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={generateFollowUpSequence}
                  disabled={generatingFollowUp}
                >
                  {generatingFollowUp ? "Generating…" : "Generate Follow-Up Sequence"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {sequence.length === 0 ? (
                <p className="text-[0.7rem] text-muted-foreground">
                  No follow-up steps saved yet. Edit this city outreach to add messages.
                </p>
              ) : (
                <div className="space-y-3">
                  {sequence.map((s, index) => (
                    <div
                      key={index}
                      className="border rounded-xl p-3 bg-muted/40 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-[0.7rem] font-medium">
                          Step {s.step ?? index + 1}
                        </div>
                        <div className="text-[0.65rem] text-muted-foreground">
                          {index === 0
                            ? "Initial message"
                            : `Sends ${s.delayDays ?? 0} days after previous`}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[0.7rem] font-semibold">
                          Subject: <span className="font-normal">{s.subject}</span>
                        </div>
                        <pre className="text-[0.7rem] text-muted-foreground whitespace-pre-wrap">
                          {s.body}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs max-h-80 overflow-y-auto">
              {events.length === 0 ? (
                <p className="text-[0.7rem] text-muted-foreground">
                  No activity yet. Status changes and key events will appear here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {events.map((ev) => (
                    <li key={ev.id} className="flex gap-2">
                      <div className="mt-[3px]">
                        <div className="h-2 w-2 rounded-full bg-foreground" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.7rem] font-medium capitalize">
                            {ev.type.replace("_", " ")}
                          </span>
                          {ev.from_status && ev.to_status && (
                            <span className="text-[0.65rem] text-muted-foreground">
                              {ev.from_status} → {ev.to_status}
                            </span>
                          )}
                        </div>
                        {ev.message && (
                          <p className="text-[0.7rem] text-muted-foreground">
                            {ev.message}
                          </p>
                        )}
                        <p className="text-[0.65rem] text-muted-foreground">
                          {new Date(ev.created_at).toLocaleString()}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
          </TabsContent>

          <TabsContent value="money">
            <div className="mt-4">
              <CampaignMoneyFollowUpTab campaignId={campaign.id} />
            </div>
          </TabsContent>
        </Tabs>

        {/* Follow-Up Sequence Modal */}
        {followUpSteps && (
          <FollowUpSequenceModal
            steps={followUpSteps}
            open={showFollowUpModal}
            onClose={() => setShowFollowUpModal(false)}
          />
        )}

        {/* Campaign Review Modal */}
        <CampaignReview
          campaignId={campaign.id}
          open={showReviewModal}
          onOpenChange={setShowReviewModal}
        />
      </div>
    </div>
  );
}

function OverviewRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.65rem] text-muted-foreground">{label}</span>
      <span className="text-[0.7rem]">{children}</span>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded-lg p-2 flex flex-col gap-0.5">
      <span className="text-[0.65rem] text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-background px-4 py-3 text-xs">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-[2px] text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

