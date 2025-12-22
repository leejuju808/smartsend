"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GenerateDraftsButton } from "@/components/drafts/GenerateDraftsButton";
import DraftReviewDrawer from "@/components/drafts/DraftReviewDrawer";
import CampaignAnalyticsCard from "./AnalyticsCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import CampaignActivity from "@/components/dashboard/CampaignActivity";
import { LeadsTable } from "@/components/leads/LeadsTable";
import ShareModal from "@/components/campaigns/ShareModal";
import ShareDialog from "@/components/campaign/ShareDialog";
import { UsageBanner } from "@/components/campaigns/UsageBanner";
import { CampaignMetrics } from "@/components/campaigns/CampaignMetrics";
import { StepMetrics } from "@/components/campaigns/StepMetrics";
import { CampaignFunnel } from "@/components/campaigns/CampaignFunnel";
import { CampaignCohort } from "@/components/campaigns/CampaignCohort";
import { CampaignDeliverability } from "@/components/campaigns/CampaignDeliverability";
import CampaignHealth from "@/components/dashboard/CampaignHealth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useBillingAccount } from "@/hooks/useBillingAccount";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface CampaignPageClientProps {
  campaignId: string;
}

export default function CampaignPageClient({ campaignId }: CampaignPageClientProps) {
  const [msg, setMsg] = useState<string>("");
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [steps, setSteps] = useState<any[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [sentToday, setSentToday] = useState<number | null>(null);
  const [canSend, setCanSend] = useState<boolean | null>(null);
  const [sendReason, setSendReason] = useState<string | null>(null);
  const [missingCount, setMissingCount] = useState<number | null>(null);
  const [loadingMissing, setLoadingMissing] = useState(false);
  const [enriching, setEnriching] = useState<"missing" | "force" | null>(null);
  const [enrichResult, setEnrichResult] = useState<any>(null);
  const supabase = createClientComponentClient();
  const { isActive } = useBillingAccount();
  const billingInactive = isActive === false;

  const normalizeStatus = (status: string | null | undefined) => {
    const lower = (status ?? "").toLowerCase();
    switch (lower) {
      case "pending":
      case "ready":
        return "queued";
      case "error":
        return "failed";
      default:
        return lower || "unknown";
    }
  };

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const { data, error } = await supabase
        .from("send_queue")
        .select(`
          id,
          status,
          created_at,
          step_no,
          attempts,
          attempt_no,
          last_error,
          error_last,
          send_after,
          next_attempt_at,
          picked_at,
          picked_by,
          leads:lead_id (email, unsubscribed, unsubscribed_at)
        `)
        .eq("campaign_id", campaignId)
        .order("send_after", { ascending: true, nullsFirst: true })
        .limit(50);

      if (error) {
        console.error("Error loading queue:", error);
      } else {
        setQueueItems(data || []);
      }
    } finally {
      setLoadingQueue(false);
    }
  }, [campaignId, supabase]);

  useEffect(() => {
    void loadQueue();
    const interval = setInterval(() => {
      void loadQueue();
    }, 10000);
    return () => clearInterval(interval);
  }, [loadQueue]);

  const loadSteps = useCallback(async () => {
    setLoadingSteps(true);
    try {
      const { data, error } = await supabase
        .from("campaign_steps")
        .select(
          "id, step_no, step_order, delay_days, offset_days, subject_template, subject, enabled, active"
        )
        .eq("campaign_id", campaignId)
        .order("step_no", { ascending: true, nullsFirst: true })
        .order("step_order", { ascending: true, nullsFirst: true });

      if (error) {
        console.error("Error loading campaign steps:", error);
        setSteps([]);
      } else {
        setSteps(data || []);
      }
    } finally {
      setLoadingSteps(false);
    }
  }, [campaignId, supabase]);

  useEffect(() => {
    void loadSteps();
  }, [loadSteps]);

  const loadSentToday = useCallback(async () => {
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from("send_logs")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "sent")
        .gte("sent_at", start.toISOString());
      if (error) {
        setSentToday(null);
        return;
      }
      setSentToday(count ?? 0);
    } catch {
      setSentToday(null);
    }
  }, [campaignId, supabase]);

  useEffect(() => {
    void loadSentToday();
    const interval = setInterval(() => void loadSentToday(), 30000);
    return () => clearInterval(interval);
  }, [loadSentToday]);

  const loadMissing = useCallback(async () => {
    setLoadingMissing(true);
    try {
      const { data: campaignLeads, error: leadsErr } = await supabase
        .from("campaign_leads")
        .select("lead_id")
        .eq("campaign_id", campaignId);
      if (leadsErr) {
        throw leadsErr;
      }
      const leadIds = (campaignLeads ?? [])
        .map((row: { lead_id: string | null }) => row.lead_id)
        .filter((id): id is string => Boolean(id));

      if (leadIds.length === 0) {
        setMissingCount(0);
        return;
      }

      const { count, error: countErr } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("id", leadIds)
        .or("tz.is.null,country.is.null");

      if (countErr) {
        throw countErr;
      }

      setMissingCount(count ?? 0);
    } catch (err) {
      console.error("Failed to load missing lead enrichment count", err);
      setMissingCount(null);
    } finally {
      setLoadingMissing(false);
    }
  }, [campaignId, supabase]);

  useEffect(() => {
    void loadMissing();
    const interval = setInterval(() => {
      void loadMissing();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadMissing]);

  useEffect(() => {
    async function checkCanSend() {
      const { data, error } = await supabase.rpc("can_send_today", { p_campaign: campaignId });
      if (error) {
        console.error("Error checking can_send_today:", error);
        setCanSend(null);
        return;
      }
      const result = data?.[0];
      setCanSend(result?.ok ?? false);
      setSendReason(result?.reason ?? null);
    }
    checkCanSend();
    const interval = setInterval(checkCanSend, 30000);
    return () => clearInterval(interval);
  }, [campaignId, supabase]);

  async function launch() {
    setMsg("Launching…");
    const { data: planOk, error: planErr } = await supabase.rpc("can_send_under_plan", { p_campaign: campaignId });
    if (planErr) {
      setMsg(planErr.message ?? "Plan check failed");
      return;
    }

    if (planOk !== true) {
      setMsg("Monthly send limit reached. Upgrade to send more.");
      return;
    }

    const r = await fetch(`/api/campaigns/${campaignId}/launch`, { method: "POST" });
    const j = await r.json();
    if (!r.ok) {
      setMsg(r.status === 402 ? "Monthly send limit reached. Upgrade to send more." : j.error || "Launch failed");
      return;
    }
    setMsg(`Queued ${j.queued} emails. First window: ${new Date(j.start_at).toLocaleString()}`);
  }

  async function tickNow() {
    const { data: planOk, error: planErr } = await supabase.rpc("can_send_under_plan", { p_campaign: campaignId });
    if (planErr) {
      setMsg(planErr.message ?? "Plan check failed");
      return;
    }

    if (planOk !== true) {
      setMsg("Monthly send limit reached. Upgrade to send more.");
      return;
    }

    const { data } = await supabase.rpc("can_send_today", { p_campaign: campaignId });
    const canSendResult = data?.[0]?.ok;
    const reason = data?.[0]?.reason;

    if (!canSendResult) {
      setMsg(
        `Cannot send: ${
          reason === "hard_cap_exceeded"
            ? "Daily plan limit reached. Upgrade to send more."
            : reason || "Unknown error"
        }`
      );
      return;
    }

    setMsg("Running scheduler tick…");
    try {
      const r = await fetch(`/api/scheduler/tick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg(r.status === 402 ? "Monthly send limit reached. Upgrade to send more." : `Error: ${j.error || "Failed"}`);
        return;
      }
      const result = j.result;
      setMsg(`Enqueued ${result?.enqueued || 0} items. Remaining capacity: ${result?.account_remaining || 0}`);
      void loadQueue();
    } catch (e: any) {
      setMsg(`Error: ${e.message || "Failed"}`);
    }
  }

  async function kickSender() {
    setMsg("Triggering send worker…");
    try {
      const res = await fetch(`/functions/v1/send-worker`, {
        method: "POST",
        headers: {
          ...(process.env.NEXT_PUBLIC_CRON_SECRET
            ? { "x-cron-secret": process.env.NEXT_PUBLIC_CRON_SECRET }
            : {}),
        },
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || `Failed with status ${res.status}`);
      }
      setMsg(`Send worker checked ${payload?.accounts ?? 0} account(s).`);
      void loadQueue();
    } catch (err: any) {
      setMsg(`Send worker failed: ${err?.message ?? err}`);
    }
  }

  async function runEnrichment(force = false) {
    setEnriching(force ? "force" : "missing");
    setEnrichResult(null);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const endpoint = supabaseUrl ? `${supabaseUrl}/functions/v1/enrich-campaign` : "/functions/v1/enrich-campaign";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ campaign_id: campaignId, force }),
      });

      const text = await res.text();
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }

      if (!res.ok) {
        const message =
          (payload && typeof payload === "object" && "message" in payload && payload.message) ||
          (typeof payload === "string" ? payload : null) ||
          "Enrichment failed";
        throw new Error(message);
      }

      setEnrichResult(payload);
      void loadQueue();
      setMsg("");
      void loadMissing();
    } catch (err: any) {
      console.error("Enrichment failed", err);
      setEnrichResult({ error: err?.message ?? "Failed" });
    } finally {
      setEnriching(null);
    }
  }

  async function refreshStats() {
    const r = await fetch(`/api/campaigns/${campaignId}/queue-stats`);
    const j = await r.json();
    if (!r.ok) {
      setMsg(j.error || "Failed to load stats");
      return;
    }
    setMsg(`Queue: ${j.queued} · Sending: ${j.sending} · Sent today: ${j.sent_today} · Failed: ${j.failed}`);
  }

  const queueSummary = queueItems.reduce<{
    queued: number;
    sending: number;
    sent: number;
    failed: number;
  }>((acc, item) => {
    const status = normalizeStatus(item.status);
    if (status in acc) {
      acc[status as keyof typeof acc] += 1;
    }
    return acc;
  },
  { queued: 0, sending: 0, sent: 0, failed: 0 });

  return (
    <>
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Sequence (read-only)</div>
          <div className="text-[11px] text-muted-foreground">
            Sends today:{" "}
            {sentToday === null ? "—" : sentToday.toLocaleString()}
          </div>
        </div>
        {loadingSteps ? (
          <div className="text-xs text-muted-foreground">Loading steps…</div>
        ) : steps.length === 0 ? (
          <div className="text-xs text-muted-foreground">No steps found.</div>
        ) : (
          <div className="space-y-2">
            {steps.map((s: any, idx: number) => {
              const n = s.step_no ?? s.step_order ?? idx + 1;
              const delay = s.delay_days ?? s.offset_days ?? 0;
              const subj = s.subject_template ?? s.subject ?? "(no subject)";
              const enabled = s.enabled ?? s.active ?? true;
              return (
                <div key={s.id ?? `${n}-${idx}`} className="rounded-xl border p-3 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold">Step {n}</div>
                    <div className="text-[11px] text-muted-foreground">
                      +{delay}d · {enabled ? "active" : "paused"}
                    </div>
                  </div>
                  <div className="text-[11px] mt-1">
                    <span className="font-semibold">Subject:</span> {subj}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex gap-3 items-center justify-between">
        <div className="flex gap-3 items-center">
          <GenerateDraftsButton campaignId={campaignId} />
          <DraftReviewDrawer campaignId={campaignId} />
          <ShareModal campaignId={campaignId} />
          <ShareDialog campaignId={campaignId} />
          <Link href={`/campaigns/${campaignId}/queue`} className="text-sm underline underline-offset-2">
            Queue
          </Link>
          <Link href={`/campaigns/${campaignId}/leads`} className="text-sm underline underline-offset-2">
            Leads
          </Link>
          <Link href={`/campaigns/${campaignId}/inbox`} className="text-sm underline underline-offset-2">
            Inbox
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {typeof missingCount === "number" && (
            <div
              className={`text-[11px] px-2 py-1 rounded-full ${
                missingCount > 0
                  ? "bg-amber-500/15 text-amber-700"
                  : "bg-emerald-500/15 text-emerald-700"
              }`}
            >
              {loadingMissing ? "Checking…" : missingCount > 0 ? `${missingCount} leads missing TZ/Country` : "All leads enriched"}
            </div>
          )}
          <Button size="sm" variant="outline" disabled={enriching !== null} onClick={() => runEnrichment(false)}>
            {enriching === "missing" ? "Enriching…" : "Enrich Missing"}
          </Button>
          <Button size="sm" disabled={enriching !== null} onClick={() => runEnrichment(true)}>
            {enriching === "force" ? "Overwriting…" : "Force Overwrite"}
          </Button>
        </div>
      </div>

      {billingInactive && (
        <Alert className="border-red-300 bg-red-50 text-red-800">
          <AlertTitle>Upgrade to send emails</AlertTitle>
          <AlertDescription>
            Your subscription is inactive. <Link href="/settings/billing" className="underline">Go to Billing</Link>
          </AlertDescription>
        </Alert>
      )}

      <UsageBanner campaignId={campaignId} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <CampaignHealth campaignId={campaignId} />
        <CampaignDeliverability campaignId={campaignId} />
      </div>

      {enrichResult && (
        <Card className="p-4 space-y-1">
          <div className="text-sm font-medium">Lead Enrichment</div>
          {enrichResult.error ? (
            <div className="text-xs text-red-600">{enrichResult.error}</div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Processed: {enrichResult.processed ?? 0} {enrichResult.force ? "(forced)" : ""}.
            </div>
          )}
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Campaign Controls</div>
        <div className="flex items-center gap-2">
          <Button onClick={launch} disabled={billingInactive}>
            Launch (build today's queue)
          </Button>
          <Button
            variant="secondary"
            onClick={tickNow}
            disabled={canSend === false || billingInactive}
            title={sendReason === "hard_cap_exceeded" ? "Daily plan limit reached" : undefined}
          >
            Run Scheduler Tick
          </Button>
          <div
            className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-700"
            title={`Queued ${queueSummary.queued} · Sending ${queueSummary.sending} · Failed ${queueSummary.failed}`}
          >
            Queue · Q{queueSummary.queued} / S{queueSummary.sending} / F{queueSummary.failed}
          </div>
          <Button variant="outline" onClick={kickSender}>
            Kick sender
          </Button>
          <Button variant="outline" onClick={refreshStats}>
            Refresh Status
          </Button>
        </div>
        {msg && <div className="text-xs text-muted-foreground">{msg}</div>}
      </Card>

      <CampaignMetrics id={campaignId} />
      <StepMetrics id={campaignId} />
      <CampaignFunnel campaignId={campaignId} />
      <CampaignCohort campaignId={campaignId} days={14} />
      <CampaignAnalyticsCard id={campaignId} />
      <ActivityFeed campaignId={campaignId} />
      <CampaignActivity campaignId={campaignId} />

      <LeadsTable defaultCampaignId={campaignId} />

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Send Queue</div>
          <Button variant="outline" size="sm" onClick={() => void loadQueue()} disabled={loadingQueue}>
            {loadingQueue ? "Loading…" : "Refresh"}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Created</th>
                <th className="text-left p-2">Step</th>
                <th className="text-left p-2">Lead Email</th>
                <th className="text-left p-2">Attempts</th>
                <th className="text-left p-2">Last Error</th>
                <th className="text-left p-2">Next Attempt</th>
                <th className="text-left p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {queueItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-muted-foreground">
                    No items in queue
                  </td>
                </tr>
              ) : (
                queueItems.map((item) => (
                  <tr key={item.id} className="border-b">
                    <td className="p-2">
                      {(() => {
                        const normalized = normalizeStatus(item.status);
                        const badgeClasses =
                          normalized === "queued"
                            ? "bg-yellow-100 text-yellow-800"
                            : normalized === "sending"
                            ? "bg-blue-100 text-blue-800"
                            : normalized === "sent"
                            ? "bg-green-100 text-green-800"
                            : normalized === "failed"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-800";
                        return (
                          <span className={`px-2 py-1 rounded text-xs ${badgeClasses}`}>
                            {normalized}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="p-2">
                      {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="p-2">{item.step_no}</td>
                    <td className="p-2">{item.leads?.email || "—"}</td>
                    <td className="p-2">{item.attempts ?? item.attempt_no ?? 0}</td>
                    <td
                      className="p-2 max-w-xs truncate text-xs text-red-600"
                      title={item.last_error || item.error_last || ""}
                    >
                      {item.last_error || item.error_last || "—"}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {normalizeStatus(item.status) === "queued" && (item.send_after || item.next_attempt_at)
                        ? new Date(item.send_after || item.next_attempt_at).toLocaleString()
                        : normalizeStatus(item.status) === "sending" && item.picked_at
                        ? `Picked ${new Date(item.picked_at).toLocaleTimeString()}`
                        : "—"}
                    </td>
                    <td className="p-2">
                      {item.status === "failed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const { error } = await supabase.rpc("retry_queue_item", { p_queue: item.id });
                            if (error) {
                              console.error("Retry failed:", error);
                            } else {
                              void loadQueue();
                            }
                          }}
                        >
                          Retry now
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

