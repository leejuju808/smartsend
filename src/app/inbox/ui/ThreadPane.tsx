"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Reply, Check } from "lucide-react";
import { AutoDraftBar } from "@/components/auto-draft-bar";
import { ActivityPane } from "@/components/activity-pane";
import { ReplyBar } from "@/components/inbox/ReplyBar";
import { SchedulePreviewBar } from "@/components/schedule-preview-bar";
import AiBadge from "@/components/AiBadge";
import { FollowUpModal } from "@/components/replies/followup-modal";
import {
  DuplicateReviewModal,
  DupeCandidate,
  MergeDirection,
  LeadSummary,
} from "@/components/leads/DuplicateReviewModal";

type Msg = {
  id: string;
  thread_id?: string;
  created_at: string;
  direction: "inbound" | "outbound";
  body_html?: string | null;
  snippet?: string | null;
  subject?: string | null;
  ai_label?: string | null;
  ai_score?: number | null;
  ai_reason?: string | null;
};

type ThreadPaneProps = {
  threadId: string;
  onReplied: () => void;
};

type ThreadHeader = {
  id: string;
  provider: string | null;
  provider_thread_id: string | null;
  campaign_id?: string | null;
  lead_id?: string | null;
  from_account_id?: string | null;
  lead_tz?: string | null;
  stopped_by_reply?: boolean | null;
  bounced_at?: string | null;
  unsubscribed_at?: string | null;
  handled?: boolean | null;
  replied_at?: string | null;
  replied_message_id?: string | null;
  reply_reason?: string | null;
  needs_reply?: boolean | null;
  last_inbound_id?: string | null;
  last_inbound_at?: string | null;
};

type CampaignLeadPause = {
  id: string;
  paused_until: string | null;
  paused_reason: string | null;
};

type ReplyDetectionInfo = {
  id: string;
  intent: string;
  confidence: number | null;
  classifier: string | null;
  created_at: string;
};

type FollowupTaskState = {
  id: string;
  scheduled_at: string;
  status: string;
  nudge_no: number;
  meta?: Record<string, any> | null;
};

type EngagementSummary = {
  firstOpenAt: string | null;
  lastClickAt: string | null;
  messagesTracked: number;
  messagesOpened: number;
  messagesClicked: number;
  opensCounted: number;
  clicksCounted: number;
};

type LinkMetric = {
  id: string;
  queueId: string;
  url: string;
  clicks: number;
  lastClickAt: string | null;
};

type FollowupDraftState = {
  id: string;
  subject: string | null;
  body: string | null;
  created_at: string;
  campaign_id: string | null;
  lead_id: string | null;
  meta?: Record<string, any> | null;
};

type EngagementInfo = {
  score: number;
  opens_30d: number;
  clicks_30d: number;
  replies_30d: number;
  bounces_30d: number;
  next_best_utc: string | null;
  histogram: { hour: number; weight: number }[];
};

export default function ThreadPane({ threadId, onReplied }: ThreadPaneProps) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [replyBody, setReplyBody] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [sending, setSending] = useState(false);
  const [hdr, setHdr] = useState<ThreadHeader | null>(null);
  const [followupTask, setFollowupTask] = useState<FollowupTaskState | null>(null);
  const [followupDraft, setFollowupDraft] = useState<FollowupDraftState | null>(null);
  const [followupLoading, setFollowupLoading] = useState(false);
  const [sendNowLoading, setSendNowLoading] = useState(false);
  const lastThreadId = useRef<string | null>(null);
  const latestThreadIdRef = useRef(threadId);
  const [primaryLead, setPrimaryLead] = useState<LeadSummary | null>(null);
  const [openSummary, setOpenSummary] = useState<EngagementSummary | null>(null);
  const [openSummaryReady, setOpenSummaryReady] = useState(false);
  const [engagement, setEngagement] = useState<EngagementInfo | null>(null);
  const [dupeCandidates, setDupeCandidates] = useState<DupeCandidate[]>([]);
  const [dupeLoading, setDupeLoading] = useState(false);
  const [dupeError, setDupeError] = useState<string | null>(null);
  const [dupeModalOpen, setDupeModalOpen] = useState(false);
  const [campaignLeadId, setCampaignLeadId] = useState<string | null>(null);
  const [pausedUntil, setPausedUntil] = useState<string | null>(null);
  const [pausedReason, setPausedReason] = useState<string | null>(null);
  const [lastDetection, setLastDetection] = useState<ReplyDetectionInfo | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [linkMetrics, setLinkMetrics] = useState<LinkMetric[]>([]);
  const [linkMetricsLoading, setLinkMetricsLoading] = useState(false);
  const [followUpVariants, setFollowUpVariants] = useState<string[] | null>(null);
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const activeLeadIdRef = useRef<string | null>(null);
  const [utcMinutes, setUtcMinutes] = useState(() => {
    const now = new Date();
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  });
  const myTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const load = useCallback(async () => {
    const { data, error } = await sb
      .from("inbox_messages")
      .select("id, thread_id, created_at, direction, body_html, snippet, subject, ai_label, ai_score, ai_reason")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("ThreadPane load error", error);
      return;
    }
    setMsgs((data ?? []) as Msg[]);
  }, [sb, threadId]);

  const loadHeader = useCallback(async () => {
    try {
      const [threadRes, overviewRes] = await Promise.all([
        sb.from("v_inbox_threads").select("*").eq("id", threadId).maybeSingle(),
        sb
          .from("v_inbox_overview")
          .select("thread_id, provider, provider_thread_id, handled")
          .eq("thread_id", threadId)
          .maybeSingle(),
      ]);

      if (threadRes.error) {
        console.error("ThreadPane header load error", threadRes.error);
      }
      if (overviewRes.error) {
        console.error("ThreadPane overview load error", overviewRes.error);
      }

      const base = threadRes.data ?? null;
      const overview = overviewRes.data ?? null;

      const campaignId = (base as any)?.campaign_id ?? null;
      const leadId = (base as any)?.lead_id ?? null;

      let leadTz: string | null = null;
      let leadProfile: LeadSummary | null = null;
      if (leadId) {
        const leadRes = await sb
          .from("leads")
          .select("id, tz, meta, first_name, last_name, company, title, email")
          .eq("id", leadId)
          .maybeSingle();
        if (leadRes.error) {
          console.error("ThreadPane lead load error", leadRes.error);
        } else {
          const data = leadRes.data as (Record<string, any> & { meta?: Record<string, any> | null }) | null;
          if (data) {
            const meta = (data.meta as Record<string, any> | null) ?? null;
            leadTz = (data.tz as string | null) ?? (meta?.tz as string | null) ?? null;
            leadProfile = {
              id: String(data.id),
              first_name: (data.first_name as string | null) ?? null,
              last_name: (data.last_name as string | null) ?? null,
              company: (data.company as string | null) ?? null,
              title: (data.title as string | null) ?? null,
              email: (data.email as string | null) ?? null,
            };
          }
        }
      } else {
        leadProfile = null;
      }
      setPrimaryLead(leadProfile);

      if (campaignId && leadId) {
        const { data: campaignLeadRowRaw, error: campaignLeadError } = await sb
          .from("campaign_leads")
          .select("id, paused_until, paused_reason")
          .eq("campaign_id", campaignId)
          .eq("lead_id", leadId)
          .maybeSingle();

        if (campaignLeadError) {
          console.error("ThreadPane campaign_leads load error", campaignLeadError);
          setCampaignLeadId(null);
          setPausedUntil(null);
          setPausedReason(null);
        } else {
          const campaignLeadRow = (campaignLeadRowRaw ?? null) as CampaignLeadPause | null;
          setCampaignLeadId(campaignLeadRow?.id ?? null);
          setPausedUntil(campaignLeadRow?.paused_until ?? null);
          setPausedReason(campaignLeadRow?.paused_reason ?? null);
        }

        const { data: detectionRowRaw, error: detectionError } = await sb
          .from("reply_detections")
          .select("id, intent, confidence, classifier, created_at")
          .eq("campaign_id", campaignId)
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (detectionError) {
          console.error("ThreadPane reply_detections load error", detectionError);
          setLastDetection(null);
        } else {
          const detectionRow = (detectionRowRaw ?? null) as ReplyDetectionInfo | null;
          setLastDetection(detectionRow ?? null);
        }
      } else {
        setCampaignLeadId(null);
        setPausedUntil(null);
        setPausedReason(null);
        setLastDetection(null);
      }

      let fromAccountId: string | null = (base as any)?.from_account_id ?? null;
      if (!fromAccountId && campaignId) {
        const campaignRes = await sb
          .from("campaigns")
          .select("id, from_account_id")
          .eq("id", campaignId)
          .maybeSingle();
        if (campaignRes.error) {
          console.error("ThreadPane campaign load error", campaignRes.error);
        }
        fromAccountId = campaignRes.data?.from_account_id ?? null;
      }

      if (!base && !overview) {
        setHdr(null);
        return;
      }

      setHdr({
        id: (base as any)?.id ?? (overview as any)?.thread_id ?? threadId,
        provider: (base as any)?.provider ?? (overview as any)?.provider ?? null,
        provider_thread_id:
          (base as any)?.provider_thread_id ?? (overview as any)?.provider_thread_id ?? null,
        campaign_id: campaignId,
        lead_id: leadId,
        from_account_id: fromAccountId,
        lead_tz: leadTz,
        stopped_by_reply: (base as any)?.stopped_by_reply ?? null,
        bounced_at: (base as any)?.bounced_at ?? null,
        unsubscribed_at: (base as any)?.unsubscribed_at ?? null,
        handled: (overview as any)?.handled ?? (base as any)?.handled ?? null,
        replied_at: (base as any)?.replied_at ?? null,
        replied_message_id: (base as any)?.replied_message_id ?? null,
        reply_reason: (base as any)?.reply_reason ?? null,
        needs_reply: (base as any)?.needs_reply ?? null,
        last_inbound_id: (base as any)?.last_inbound_id ?? null,
        last_inbound_at: (base as any)?.last_inbound_at ?? null,
      });

      if (!leadId) {
        setEngagement(null);
        return;
      }

      try {
        const response = await fetch(`/api/engagement/lead/${leadId}`);
        if (!response.ok) {
          console.error("ThreadPane engagement load error", await response.text());
          if (latestThreadIdRef.current === threadId) {
            setEngagement(null);
          }
          return;
        }

        const payload = await response.json();
        if (latestThreadIdRef.current !== threadId) {
          return;
        }

        const histogram = Array.isArray(payload?.histogram)
          ? (payload.histogram as Array<{ hour: number; weight: number }>)
              .map((row) => ({
                hour: Number(row.hour),
                weight: Number(row.weight),
              }))
              .filter(
                (row) =>
                  Number.isFinite(row.hour) &&
                  row.hour >= 0 &&
                  row.hour <= 23 &&
                  Number.isFinite(row.weight)
              )
          : [];

        setEngagement({
          score: Number(payload?.score ?? payload?.engagement_score ?? 0),
          opens_30d: Number(payload?.opens_30d ?? 0),
          clicks_30d: Number(payload?.clicks_30d ?? 0),
          replies_30d: Number(payload?.replies_30d ?? 0),
          bounces_30d: Number(payload?.bounces_30d ?? 0),
          next_best_utc: payload?.next_best_utc ?? null,
          histogram,
        });
      } catch (error) {
        console.error("ThreadPane engagement load error", error);
        if (latestThreadIdRef.current === threadId) {
          setEngagement(null);
        }
      }
    } catch (error) {
      console.error("ThreadPane header unexpected error", error);
    }
  }, [sb, threadId]);

  const loadFollowup = useCallback(async () => {
    setFollowupLoading(true);
    try {
      const { data: taskRows, error: taskError } = await sb
        .from("followup_tasks")
        .select("id, scheduled_at, status, nudge_no, meta")
        .eq("thread_id", threadId)
        .in("status", ["queued", "running"])
        .order("scheduled_at", { ascending: true })
        .limit(1);

      if (taskError) {
        console.error("ThreadPane followup task load error", taskError);
        return;
      }

      const nextTask = (taskRows ?? [])[0] ?? null;
      setFollowupTask(nextTask as FollowupTaskState | null);

      if (!nextTask) {
        setFollowupDraft(null);
        return;
      }

      const { data: draftRows, error: draftError } = await sb
        .from("reply_drafts")
        .select("id, subject, body, created_at, campaign_id, lead_id, meta")
        .eq("thread_id", threadId)
        .eq("meta->>kind", "followup")
        .order("created_at", { ascending: false })
        .limit(1);

      if (draftError) {
        console.error("ThreadPane followup draft load error", draftError);
        setFollowupDraft(null);
        return;
      }

      setFollowupDraft(((draftRows ?? [])[0] ?? null) as FollowupDraftState | null);
    } catch (error) {
      console.error("ThreadPane followup unexpected error", error);
    } finally {
      setFollowupLoading(false);
    }
  }, [sb, threadId]);

  const loadDupes = useCallback(
    async (leadId: string) => {
      if (!leadId) {
        activeLeadIdRef.current = null;
        setDupeCandidates([]);
        setDupeError(null);
        setDupeLoading(false);
        return;
      }
      if (activeLeadIdRef.current !== leadId) {
        setDupeCandidates([]);
      }
      activeLeadIdRef.current = leadId;
      setDupeLoading(true);
      setDupeError(null);
      try {
        const response = await fetch(`/api/leads/dupes/search?leadId=${encodeURIComponent(leadId)}`);
        const payload = await response.json().catch(() => null);
        const body = payload as { error?: string } | null;
        if (activeLeadIdRef.current !== leadId) {
          return;
        }
        if (!response.ok) {
          const message = body?.error ?? `Failed to load duplicates (${response.status})`;
          throw new Error(message);
        }
        setDupeCandidates(Array.isArray(payload) ? (payload as DupeCandidate[]) : []);
      } catch (error) {
        console.error("ThreadPane duplicate load error", error);
        if (activeLeadIdRef.current === leadId) {
          setDupeCandidates([]);
          setDupeError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (activeLeadIdRef.current === leadId) {
          setDupeLoading(false);
        }
      }
    },
    []
  );

  const handleMergeRequest = useCallback(
    async (candidate: DupeCandidate, direction: MergeDirection, createAlias: boolean) => {
      const currentPrimaryId = primaryLead?.id ?? hdr?.lead_id ?? null;
      const candidateInfo = Array.isArray(candidate.leads)
        ? (candidate.leads[0] as { email?: string | null } | undefined)
        : (candidate.leads as { email?: string | null } | null);

      const winnerId =
        direction === "candidate_into_primary" ? currentPrimaryId : candidate.other_lead_id;
      const loserId =
        direction === "candidate_into_primary" ? candidate.other_lead_id : currentPrimaryId;

      if (!winnerId || !loserId) {
        throw new Error("Missing lead identifiers for merge");
      }

      const canonicalId = winnerId;
      const losingId = loserId;
      let mergeSucceeded = false;

      try {
        const mergeRes = await fetch("/api/leads/merge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            leadId: canonicalId,
            duplicateId: losingId,
            reason: candidate.reason ?? "manual",
          }),
        });
        const mergeJson = (await mergeRes.json().catch(() => ({}))) as { error?: string };
        if (!mergeRes.ok || mergeJson?.error) {
          throw new Error(mergeJson?.error ?? `Merge failed (${mergeRes.status})`);
        }
        mergeSucceeded = true;

        if (createAlias) {
          const aliasEmail =
            direction === "candidate_into_primary"
              ? candidateInfo?.email ?? null
              : primaryLead?.email ?? null;
          if (aliasEmail) {
            const aliasRes = await fetch("/api/leads/alias", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ email: aliasEmail, lead_id: canonicalId }),
            });
            const aliasJson = (await aliasRes.json().catch(() => ({}))) as { error?: string };
            if (!aliasRes.ok || aliasJson?.error) {
              throw new Error(aliasJson?.error ?? `Alias failed (${aliasRes.status})`);
            }
          }
        }
      } finally {
        if (mergeSucceeded) {
          await Promise.all([load(), loadHeader(), loadFollowup()]);
          await loadDupes(canonicalId);
        }
      }
    },
    [primaryLead, hdr?.lead_id, load, loadHeader, loadFollowup, loadDupes]
  );

  useEffect(() => {
    latestThreadIdRef.current = threadId;
  }, [threadId]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setUtcMinutes(now.getUTCHours() * 60 + now.getUTCMinutes());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    load();
    loadHeader();
    loadFollowup();
  }, [load, loadHeader, loadFollowup]);

  useEffect(() => {
    if (hdr?.lead_id) {
      void loadDupes(hdr.lead_id);
    } else {
      activeLeadIdRef.current = null;
      setDupeCandidates([]);
      setDupeError(null);
      setDupeLoading(false);
    }
    setDupeModalOpen(false);
  }, [hdr?.lead_id, loadDupes]);

  useEffect(() => {
    let ignore = false;

    async function fetchEngagementSummary(
      leadId: string,
      campaignId: string | null,
      accountId: string | null
    ) {
      setOpenSummaryReady(false);
      try {
        let statsQuery = sb
          .from("message_stats")
          .select("queue_id, opens, clicks, opened, clicked")
          .eq("lead_id", leadId);

        if (campaignId) {
          statsQuery = statsQuery.eq("campaign_id", campaignId);
        }
        if (accountId) {
          statsQuery = statsQuery.eq("account_id", accountId);
        }

        const { data: statsRows, error: statsError } = await statsQuery;
        if (statsError) {
          throw statsError;
        }

        const stats = (statsRows ?? []) as Array<{
          opens: number | null;
          clicks: number | null;
          opened: boolean | null;
          clicked: boolean | null;
        }>;

        const messagesTracked = stats.length;
        const messagesOpened = stats.filter((row) => row.opened).length;
        const messagesClicked = stats.filter((row) => row.clicked).length;
        const opensCounted = stats.reduce(
          (sum, row) => sum + (Number(row.opens) || 0),
          0
        );
        const clicksCounted = stats.reduce(
          (sum, row) => sum + (Number(row.clicks) || 0),
          0
        );

        const openQuery = sb
          .from("tracking_events")
          .select("created_at")
          .eq("lead_id", leadId)
          .eq("kind", "open");
        if (campaignId) {
          openQuery.eq("campaign_id", campaignId);
        }
        if (accountId) {
          openQuery.eq("account_id", accountId);
        }

        const clickQuery = sb
          .from("tracking_events")
          .select("created_at")
          .eq("lead_id", leadId)
          .eq("kind", "click");
        if (campaignId) {
          clickQuery.eq("campaign_id", campaignId);
        }
        if (accountId) {
          clickQuery.eq("account_id", accountId);
        }

        const [firstOpenRes, lastClickRes] = await Promise.all([
          openQuery.order("created_at", { ascending: true }).limit(1).maybeSingle(),
          clickQuery.order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);

        if (ignore) return;

        setOpenSummary({
          firstOpenAt: firstOpenRes.data?.created_at ?? null,
          lastClickAt: lastClickRes.data?.created_at ?? null,
          messagesTracked,
          messagesOpened,
          messagesClicked,
          opensCounted,
          clicksCounted,
        });
      } catch (error) {
        if (!ignore) {
          console.error("ThreadPane engagement summary load error", error);
          setOpenSummary({
            firstOpenAt: null,
            lastClickAt: null,
            messagesTracked: 0,
            messagesOpened: 0,
            messagesClicked: 0,
            opensCounted: 0,
            clicksCounted: 0,
          });
        }
      } finally {
        if (!ignore) {
          setOpenSummaryReady(true);
        }
      }
    }

    if (!hdr?.lead_id) {
      setOpenSummary(null);
      setOpenSummaryReady(false);
      return;
    }

    fetchEngagementSummary(
      hdr.lead_id,
      hdr.campaign_id ?? null,
      hdr.from_account_id ?? null
    );

    return () => {
      ignore = true;
    };
  }, [sb, hdr?.lead_id, hdr?.campaign_id, hdr?.from_account_id]);

  useEffect(() => {
    let ignore = false;

    async function fetchLinkMetrics(leadId: string, campaignId: string) {
      setLinkMetricsLoading(true);
      try {
        const { data: queueRows, error: queueError } = await sb
          .from("send_queue")
          .select("id")
          .eq("lead_id", leadId)
          .eq("campaign_id", campaignId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (queueError) {
          throw queueError;
        }

        const queueIds = (queueRows ?? []).map((row: any) => row.id).filter(Boolean);
        if (!queueIds.length) {
          if (!ignore) {
            setLinkMetrics([]);
          }
          return;
        }

        const { data: linkRows, error: linkError } = await sb
          .from("tracked_links")
          .select("id, queue_id, original_url, clicks")
          .in("queue_id", queueIds)
          .order("created_at", { ascending: false });

        if (linkError) {
          throw linkError;
        }

        const linkIds = (linkRows ?? []).map((row: any) => row.id).filter(Boolean);
        const lastClicks = new Map<string, string>();

        if (linkIds.length) {
          const { data: clickEvents, error: clickError } = await sb
            .from("tracking_events")
            .select("link_id, created_at")
            .in("link_id", linkIds)
            .eq("kind", "click")
            .order("created_at", { ascending: false });

          if (clickError) {
            console.error("ThreadPane link click events error", clickError);
          } else {
            for (const event of clickEvents ?? []) {
              const linkId = (event as any)?.link_id;
              const createdAt = (event as any)?.created_at;
              if (linkId && !lastClicks.has(linkId) && createdAt) {
                lastClicks.set(linkId, createdAt);
              }
            }
          }
        }

        if (!ignore) {
          const metrics = (linkRows ?? []).map((row: any) => ({
            id: row.id,
            queueId: row.queue_id,
            url: row.original_url,
            clicks: Number(row.clicks ?? 0),
            lastClickAt: lastClicks.get(row.id) ?? null,
          }));
          setLinkMetrics(metrics);
        }
      } catch (error) {
        if (!ignore) {
          console.error("ThreadPane link metrics load error", error);
          setLinkMetrics([]);
        }
      } finally {
        if (!ignore) {
          setLinkMetricsLoading(false);
        }
      }
    }

    if (!hdr?.lead_id || !hdr?.campaign_id) {
      setLinkMetrics([]);
      setLinkMetricsLoading(false);
      return;
    }

    fetchLinkMetrics(hdr.lead_id, hdr.campaign_id);

    return () => {
      ignore = true;
    };
  }, [sb, hdr?.lead_id, hdr?.campaign_id]);

  async function sendReply() {
    if (!hdr || !replyBody.trim()) return;
    const functionsBase = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL;
    if (!functionsBase) {
      alert("Functions URL not configured");
      return;
    }

    const subjectSource =
      replySubject.trim() ||
      (msgs.find((m) => m.subject)?.subject ?? "");
    const normalizedSubject = subjectSource.toLowerCase().startsWith("re:")
      ? subjectSource
      : subjectSource
      ? `Re: ${subjectSource}`
      : "Re:";

    setSending(true);
    const now = new Date().toISOString();
    const tempId = `temp-${Date.now()}`;
    const optimistic: Msg = {
      id: tempId,
      thread_id: threadId,
      created_at: now,
      direction: "outbound",
      subject: normalizedSubject,
      body_html: replyBody,
      snippet: replyBody,
    };

    setMsgs((prev) => [...prev, optimistic]);
    try {
      const url = `${functionsBase.replace(/\/$/, "")}/inbox-reply`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          subject: normalizedSubject,
          body_html: replyBody,
        }),
      });

      const json = await res.json().catch(() => ({ ok: false, error: "invalid json" }));
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setReplyBody("");
      setReplySubject(normalizedSubject);
      onReplied();
      await load();
      await loadHeader();
      await loadFollowup();
    } catch (error) {
      console.error("sendReply error", error);
      setMsgs((prev) => prev.filter((m) => m.id !== tempId));
      alert(`Send failed: ${String(error instanceof Error ? error.message : error)}`);
    } finally {
      setSending(false);
    }
  }

  async function toggleHandled(next: boolean) {
    if (!hdr) return;
    const { error } = await sb.rpc("inbox_mark_handled", {
      p_thread: hdr.id ?? threadId,
      p_handled: next,
    });
    if (error) {
      alert(error.message);
      return;
    }
    setHdr((prev) => (prev ? { ...prev, handled: next } : prev));
  }

  async function generateFollowUp() {
    setFollowUpLoading(true);
    try {
      const res = await fetch("/api/ai/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to generate follow-up" }));
        throw new Error(error.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setFollowUpVariants(data.variants || []);
      setFollowUpModalOpen(true);
    } catch (error) {
      console.error("generateFollowUp error", error);
      alert(`Failed to generate follow-up: ${String(error instanceof Error ? error.message : error)}`);
    } finally {
      setFollowUpLoading(false);
    }
  }

  const lastInbound = useMemo(
    () => [...msgs].reverse().find((m) => m.direction === "inbound"),
    [msgs]
  );

  const outreachReceipt = useMemo(() => {
    const outbound = msgs.filter((m) => m.direction === "outbound");
    const firstOutboundAt = outbound[0]?.created_at ?? null;
    const followupsSent = Math.max(0, outbound.length - 1);
    const optedOutAt = hdr?.unsubscribed_at ?? null;

    const fmt = (value: string | null) => {
      if (!value) return null;
      try {
        return new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(new Date(value));
      } catch {
        return new Date(value).toLocaleDateString();
      }
    };

    return {
      firstContactLabel: fmt(firstOutboundAt),
      followupsSent,
      optedOut: Boolean(optedOutAt),
      optedOutLabel: fmt(optedOutAt),
    };
  }, [msgs, hdr?.unsubscribed_at]);

  const defaultSubject = useMemo(() => {
    const subject = [...msgs]
      .reverse()
      .find((m) => (m.subject ?? "").trim().length > 0)?.subject;
    if (!subject) return "Re:";
    return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
  }, [msgs]);

  const showAssistBars = useMemo(() => {
    const label = (lastInbound?.ai_label || "").toLowerCase();
    const score = Number(lastInbound?.ai_score ?? 0);
    return (label === "meeting" || label === "positive") && score >= 0.7;
  }, [lastInbound]);

  const lastInboundId = hdr?.last_inbound_id ?? lastInbound?.id ?? null;

  const handleMarked = useCallback(
    (marked: boolean) => {
      if (!marked) return;
      setHdr((prev) =>
        prev
          ? {
              ...prev,
              needs_reply: false,
              replied_at: prev.replied_at ?? new Date().toISOString(),
            }
          : prev
      );
      void loadHeader();
      void loadFollowup();
      onReplied();
    },
    [loadHeader, loadFollowup, onReplied]
  );

  useEffect(() => {
    if (threadId !== lastThreadId.current) {
      setReplySubject(defaultSubject);
      lastThreadId.current = threadId;
    }
  }, [threadId, defaultSubject]);

  const handleSendNow = useCallback(async () => {
    if (!followupTask || !followupDraft) {
      alert("Follow-up draft not ready yet");
      return;
    }
    setSendNowLoading(true);
    try {
      const response = await fetch(`/api/inbox/threads/${threadId}/followups`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send_now", task_id: followupTask.id, draft_id: followupDraft.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error ?? `Send failed (${response.status})`);
      }
      await loadFollowup();
      await load();
      await loadHeader();
      onReplied();
    } catch (error) {
      console.error("ThreadPane send now error", error);
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setSendNowLoading(false);
    }
  }, [followupTask, followupDraft, load, loadFollowup, loadHeader, onReplied, threadId]);

  const pausedActive = useMemo(() => {
    if (!pausedUntil) return false;
    const ts = Date.parse(pausedUntil);
    if (Number.isNaN(ts)) return false;
    return ts > Date.now();
  }, [pausedUntil]);

  const handleResume = useCallback(async () => {
    if (!pausedActive || !hdr?.campaign_id || !hdr?.lead_id) return;
    setResumeLoading(true);
    try {
      const response = await fetch("/api/resume-followups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaign_id: hdr.campaign_id,
          lead_id: hdr.lead_id,
          reason: "manual_unpause",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false || payload?.error) {
        throw new Error(payload?.error ?? `Resume failed (${response.status})`);
      }
      await loadHeader();
      await loadFollowup();
    } catch (error) {
      console.error("ThreadPane resume error", error);
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setResumeLoading(false);
    }
  }, [hdr?.campaign_id, hdr?.lead_id, loadFollowup, loadHeader, pausedActive]);

  const bestHourUtc = useMemo(() => {
    if (engagement?.histogram?.length) {
      let winner = engagement.histogram[0];
      for (const row of engagement.histogram) {
        if (row.weight > winner.weight) {
          winner = row;
        } else if (row.weight === winner.weight && row.hour < winner.hour) {
          winner = row;
        }
      }
      return Number.isFinite(winner?.hour) ? winner.hour : null;
    }
    if (engagement?.next_best_utc) {
      const ts = new Date(engagement.next_best_utc);
      if (!Number.isNaN(ts.getTime())) {
        return ts.getUTCHours();
      }
    }
    return null;
  }, [engagement]);

  const bestHourUtcLabel = useMemo(() => {
    if (bestHourUtc == null) return null;
    return `${bestHourUtc.toString().padStart(2, "0")}:00`;
  }, [bestHourUtc]);

  const bestHourLocal = useMemo(() => {
    if (bestHourUtc == null) return null;
    const base = new Date(Date.UTC(2020, 0, 1, bestHourUtc, 0, 0));
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: myTz,
        timeZoneName: "short",
      }).format(base);
    } catch {
      return base.toLocaleTimeString();
    }
  }, [bestHourUtc, myTz]);

  const isPrimeWindow = useMemo(() => {
    if (bestHourUtc == null) return false;
    const targetMinutes = bestHourUtc * 60;
    const diff = Math.abs(utcMinutes - targetMinutes);
    const wrapped = Math.min(diff, 1440 - diff);
    return wrapped <= 30;
  }, [bestHourUtc, utcMinutes]);

  const engagementScore = useMemo(() => {
    if (!engagement) return 0;
    const raw = Number(engagement.score ?? 0);
    const safe = Number.isFinite(raw) ? raw : 0;
    return Math.max(0, Math.min(100, Math.round(safe)));
  }, [engagement]);

  const engagementTitle = useMemo(() => {
    if (!engagement) return undefined;
    return `Replies: ${engagement.replies_30d} • Clicks: ${engagement.clicks_30d} • Opens: ${engagement.opens_30d} • Bounces: ${engagement.bounces_30d}`;
  }, [engagement]);

  const scheduledLabel = useMemo(() => {
    if (!followupTask?.scheduled_at) return null;
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: hdr?.lead_tz ?? myTz,
      }).format(new Date(followupTask.scheduled_at));
    } catch (error) {
      console.error("ThreadPane schedule format error", error);
      return new Date(followupTask.scheduled_at).toLocaleString();
    }
  }, [followupTask?.scheduled_at, hdr?.lead_tz, myTz]);

  const pausedUntilLabel = useMemo(() => {
    if (!pausedUntil) return null;
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: hdr?.lead_tz ?? myTz,
      }).format(new Date(pausedUntil));
    } catch (error) {
      console.error("ThreadPane pause date format error", error);
      return new Date(pausedUntil).toLocaleString();
    }
  }, [pausedUntil, hdr?.lead_tz, myTz]);

  const detectionConfidenceLabel = useMemo(() => {
    if (lastDetection?.confidence == null) return null;
    const pct = Math.round(
      Math.max(0, Math.min(100, Number.isFinite(lastDetection.confidence) ? lastDetection.confidence * 100 : 0)),
    );
    return `${pct}%`;
  }, [lastDetection?.confidence]);

  const detectionRecordedLabel = useMemo(() => {
    if (!lastDetection?.created_at) return null;
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(lastDetection.created_at));
    } catch (error) {
      console.error("ThreadPane detection date format error", error);
      return new Date(lastDetection.created_at).toLocaleString();
    }
  }, [lastDetection?.created_at]);

  const detectionIntentLabel = useMemo(() => {
    if (!lastDetection?.intent) return null;
    const cleaned = lastDetection.intent.replace(/_/g, " ");
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }, [lastDetection?.intent]);

  const detectionClassifierLabel = useMemo(() => {
    if (!lastDetection?.classifier) return null;
    return lastDetection.classifier.toUpperCase();
  }, [lastDetection?.classifier]);

  const pausedReasonLabel = useMemo(() => {
    if (!pausedReason) return "reply_detected";
    const cleaned = pausedReason.replace(/_/g, " ");
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }, [pausedReason]);

  const firstOpenLabel = useMemo(() => {
    if (!openSummary?.firstOpenAt) return null;
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(openSummary.firstOpenAt));
    } catch (error) {
      console.error("ThreadPane open date format error", error);
      return new Date(openSummary.firstOpenAt).toLocaleString();
    }
  }, [openSummary?.firstOpenAt]);

  const openSummarySubtitle = useMemo(() => {
    if (!openSummaryReady) return null;
    if (!openSummary || openSummary.messagesTracked === 0) {
      return "No tracked messages yet";
    }
    return `${openSummary.messagesOpened}/${openSummary.messagesTracked} messages opened • ${openSummary.messagesClicked} messages clicked`;
  }, [openSummaryReady, openSummary]);

  const openTotalsLabel = useMemo(() => {
    if (!openSummary) return null;
    return `Opened • ${openSummary.opensCounted}`;
  }, [openSummary]);

  const clickTotalsLabel = useMemo(() => {
    if (!openSummary) return null;
    return `Clicked • ${openSummary.clicksCounted}`;
  }, [openSummary]);

  const hasOpened = useMemo(
    () => Boolean(openSummary && openSummary.opensCounted > 0),
    [openSummary]
  );

  const hasClicked = useMemo(
    () => Boolean(openSummary && openSummary.clicksCounted > 0),
    [openSummary]
  );

  const lastClickLabel = useMemo(() => {
    if (!openSummary?.lastClickAt) return null;
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(openSummary.lastClickAt));
    } catch (error) {
      console.error("ThreadPane click date format error", error);
      return new Date(openSummary.lastClickAt).toLocaleString();
    }
  }, [openSummary?.lastClickAt]);

  const formatLinkTimestamp = useCallback((value: string | null) => {
    if (!value) return "—";
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value));
    } catch (error) {
      console.error("ThreadPane link timestamp format error", error);
      return new Date(value).toLocaleString();
    }
  }, []);

  const shortenUrl = useCallback((url: string) => {
    if (!url) return "—";
    return url.length > 70 ? `${url.slice(0, 67)}…` : url;
  }, []);

  const trackedLinksSection = (
    <div className="rounded-lg border bg-background">
      <div className="px-3 py-2 border-b text-xs font-semibold uppercase text-muted-foreground">
        Tracked Links
      </div>
      <div className="max-h-64 overflow-auto">
        {linkMetricsLoading ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
        ) : linkMetrics.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No tracked links yet.
          </div>
        ) : (
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Message</th>
                <th className="px-3 py-2 text-left font-semibold">Link</th>
                <th className="px-3 py-2 text-center font-semibold">Clicks</th>
                <th className="px-3 py-2 text-left font-semibold">Last Click</th>
              </tr>
            </thead>
            <tbody>
              {linkMetrics.map((row) => (
                <tr key={row.id} className="border-t border-muted">
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                    {row.queueId ? `${String(row.queueId).slice(0, 8)}…` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary underline underline-offset-2"
                    >
                      {shortenUrl(row.url)}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-center font-semibold">
                    {row.clicks}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {formatLinkTimestamp(row.lastClickAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  const canSendNow = Boolean(followupDraft);

  return (
    <>
      <div className="h-full grid lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col">
        {(hdr?.provider || hdr?.provider_thread_id) && (
          <div className="flex items-center gap-2 text-xs opacity-60 px-4 py-2 border-b">
            <span>{hdr?.provider ? String(hdr.provider).toUpperCase() : ""}</span>
            {hdr?.provider_thread_id && (
              <code className="px-2 py-0.5 rounded bg-muted">
                {String(hdr.provider_thread_id).slice(0, 12)}…
              </code>
            )}
          </div>
        )}
        {hdr?.lead_id && dupeCandidates.length === 0 && dupeLoading && !dupeError ? (
          <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
            Checking for duplicates…
          </div>
        ) : null}
        {hdr?.lead_id && dupeCandidates.length > 0 ? (
          <div className="border-b bg-amber-50 px-4 py-2">
            <button
              type="button"
              onClick={() => setDupeModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-200"
            >
              Possible duplicate
              {dupeCandidates.length > 1 ? (
                <span className="rounded-full bg-amber-200 px-2 py-[2px] text-[10px] font-semibold text-amber-900">
                  {dupeCandidates.length}
                </span>
              ) : null}
            </button>
          </div>
        ) : null}
        {dupeError && hdr?.lead_id ? (
          <div className="border-b bg-red-50 px-4 py-2 text-xs text-red-700">
            Failed to load duplicates: {dupeError}
          </div>
        ) : null}
        {hdr?.lead_id ? (
          <div className="border-b bg-background px-4 py-2 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              First contact:{" "}
              <span className="font-medium text-foreground">
                {outreachReceipt.firstContactLabel ?? "—"}
              </span>
            </span>
            <span className="text-muted-foreground">
              Follow-ups sent:{" "}
              <span className="font-medium text-foreground">
                {outreachReceipt.followupsSent}
              </span>
            </span>
            <span
              className={
                outreachReceipt.optedOut
                  ? "inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-[11px] font-semibold text-red-700"
                  : "inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-700"
              }
              title={outreachReceipt.optedOutLabel ? `Opted out ${outreachReceipt.optedOutLabel}` : undefined}
            >
              {outreachReceipt.optedOut ? "Opted out" : "Opt-in"}
            </span>
          </div>
        ) : null}
        {openSummaryReady && hdr?.lead_id ? (
          <div className="border-b bg-background px-4 py-2 flex flex-wrap items-center gap-3 text-xs">
            <span
              className={
                hasOpened
                  ? "font-medium text-emerald-600"
                  : "text-muted-foreground"
              }
            >
              {hasOpened
                ? firstOpenLabel
                  ? `Opened • ${firstOpenLabel}`
                  : "Opened"
                : "Not opened"}
            </span>
            {hasClicked && lastClickLabel ? (
              <span className="text-muted-foreground">
                Clicked • {lastClickLabel}
              </span>
            ) : null}
            <div className="flex items-center gap-2">
              <span
                className={
                  hasOpened
                    ? "inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-700"
                    : "inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground"
                }
              >
                {openTotalsLabel ?? "Opened • 0"}
              </span>
              <span
                className={
                  hasClicked
                    ? "inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-[11px] font-semibold text-sky-700"
                    : "inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground"
                }
              >
                {clickTotalsLabel ?? "Clicked • 0"}
              </span>
            </div>
            {openSummarySubtitle ? (
              <span className="text-muted-foreground">{openSummarySubtitle}</span>
            ) : null}
          </div>
        ) : null}
        {pausedActive ? (
          <div className="border-b bg-amber-100 px-4 py-2 text-xs text-amber-900 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-200 px-3 py-1 font-semibold text-amber-900">
              Paused: {pausedReasonLabel ?? "unknown"}
            </span>
            <span>
              {pausedUntilLabel ? `Until ${pausedUntilLabel}` : "No resume time set"}
            </span>
            <Button
              variant="default"
              size="sm"
              onClick={handleResume}
              disabled={resumeLoading || !hdr?.campaign_id || !hdr?.lead_id}
            >
              {resumeLoading ? "Resuming…" : "Resume follow-ups"}
            </Button>
          </div>
        ) : null}
        {lastDetection ? (
          <div className="border-b bg-slate-50 px-4 py-2 text-xs text-slate-700 flex flex-wrap items-center gap-3">
            <span>
              Reply intent:{" "}
              <span className="font-semibold text-slate-900">
                {detectionIntentLabel ?? lastDetection.intent}
              </span>
            </span>
            {detectionConfidenceLabel ? (
              <span>Confidence {detectionConfidenceLabel}</span>
            ) : null}
            {detectionClassifierLabel ? (
              <span>Classifier {detectionClassifierLabel}</span>
            ) : null}
            {detectionRecordedLabel ? (
              <span>Detected {detectionRecordedLabel}</span>
            ) : null}
          </div>
        ) : null}
        {hdr?.campaign_id && hdr?.lead_id ? (
          <div className="border-b bg-muted/30 px-4 py-3">
            <SchedulePreviewBar
              campaignId={hdr.campaign_id}
              leadId={hdr.lead_id}
              leadTz={hdr.lead_tz}
              myTz={myTz}
            />
          </div>
        ) : null}
        {engagement ? (
          <div className="border-b bg-background px-4 py-2 flex flex-wrap items-center gap-2 text-xs">
            <span
              className="rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-800"
              title={engagementTitle}
            >
              Engagement {engagementScore}/100
            </span>
            {bestHourUtcLabel ? (
              <span
                className="rounded-full bg-slate-100 px-3 py-1 text-slate-700"
                title="Learned from opens/clicks/replies."
              >
                Best hour {bestHourUtcLabel} UTC
                {bestHourLocal ? ` (≈ ${bestHourLocal})` : ""}
              </span>
            ) : null}
            {isPrimeWindow ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800">
                Prime window
              </span>
            ) : null}
          </div>
        ) : null}
        {followupTask ? (
          <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900 flex flex-wrap items-center gap-3">
            <span className="font-medium">
              Smart follow-up scheduled: {scheduledLabel ?? "pending"} (nudge #{followupTask.nudge_no})
              {followupTask.meta?.auto_send ? " · auto-send" : ""}
            </span>
            {!followupDraft && !followupLoading ? (
              <span className="text-[11px] text-amber-700">
                Draft will generate closer to send time.
              </span>
            ) : null}
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendNow}
                disabled={sendNowLoading || !canSendNow}
                title={!canSendNow ? "No follow-up draft available yet" : undefined}
              >
                {sendNowLoading ? "Sending…" : "Send Now"}
              </Button>
            </div>
          </div>
        ) : null}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {msgs.map((m) => (
            <div key={m.id} className={m.direction === "outbound" ? "text-right" : "text-left"}>
              <div className="inline-block max-w-[85%] p-3 rounded-2xl border">
                <div className="flex items-center justify-between gap-2 text-xs opacity-60">
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                  {m.direction === "inbound" && m.ai_label ? (
                    <div className="flex items-center gap-2">
                      <AiBadge label={m.ai_label} score={m.ai_score ?? undefined} />
                      {m.ai_reason ? (
                        <span className="text-[11px] text-muted-foreground max-w-[180px] truncate">
                          {m.ai_reason}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div
                  className="prose prose-sm"
                  dangerouslySetInnerHTML={{ __html: m.body_html || m.snippet || "" }}
                />
              </div>
            </div>
          ))}
          {msgs.length === 0 && <div className="opacity-60 text-sm">No messages yet.</div>}
        </div>
        {hdr?.stopped_by_reply && (
          <div className="m-3 p-3 rounded-xl border bg-muted">
            Sequence is <b>stopped</b>
            {hdr?.bounced_at ? " (bounced)" : hdr?.unsubscribed_at ? " (unsubscribed)" : ""}.
            You can still reply manually.
          </div>
        )}
        {hdr && (
          <div className="px-3 pb-3">
            <ReplyBar
              threadId={threadId}
              lastInboundId={lastInboundId ?? undefined}
              initialNeedsReply={hdr.needs_reply}
              onMarked={handleMarked}
            />
          </div>
        )}
        {hdr ? (
          <>
            <Separator />
            <div className="p-3 flex flex-col gap-3">
              <div className="space-y-2">
                <Input
                  placeholder="Subject"
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                />
                <Textarea
                  placeholder="Type your reply…"
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  className="min-h-[120px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={sendReply} disabled={sending || !replyBody.trim()}>
                  <Reply className="h-4 w-4 mr-1" />
                  {sending ? "Sending…" : "Send"}
                </Button>
                <Button
                  variant={hdr.handled ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => toggleHandled(!(hdr.handled ?? false))}
                >
                  <Check className="h-4 w-4 mr-1" />
                  {hdr.handled ? "Handled" : "Mark handled"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateFollowUp}
                  disabled={followUpLoading}
                >
                  {followUpLoading ? "Thinking…" : "Generate Follow-Up"}
                </Button>
                <div className="ml-auto text-xs text-muted-foreground">
                  Provider: {hdr.provider || "?"}
                </div>
              </div>
              {showAssistBars && lastInbound?.id && (
                <div className="space-y-3">
                  {/* TODO: BookItBar goes here when available */}
                  <AutoDraftBar
                    threadId={threadId}
                    lastInboundId={lastInbound.id}
                    onInsert={(subject, body) => {
                      if (subject?.trim()) {
                        setReplySubject(subject);
                      }
                      setReplyBody(body || "");
                    }}
                    campaignId={hdr?.campaign_id ?? null}
                    leadId={hdr?.lead_id ?? null}
                    fromAccountId={hdr?.from_account_id ?? null}
                  />
                </div>
              )}
            </div>
          </>
        ) : null}
        <div className="border-t p-3 lg:hidden space-y-4">
          <ActivityPane threadId={threadId} leadId={hdr?.lead_id ?? null} />
          {trackedLinksSection}
        </div>
      </div>
      <div className="hidden lg:block border-l bg-muted/30 p-3 overflow-y-auto">
        <div className="flex flex-col gap-4">
          <ActivityPane threadId={threadId} leadId={hdr?.lead_id ?? null} />
          {trackedLinksSection}
        </div>
      </div>
      </div>
      <DuplicateReviewModal
        open={dupeModalOpen}
        onOpenChange={setDupeModalOpen}
        primaryLead={primaryLead}
        candidates={dupeCandidates}
        loading={dupeLoading}
        errorMessage={dupeError}
        onMerge={handleMergeRequest}
      />
      {followUpVariants && (
        <FollowUpModal
          open={followUpModalOpen}
          onOpenChange={setFollowUpModalOpen}
          variants={followUpVariants}
          onApply={(variant) => {
            setReplyBody(variant);
          }}
        />
      )}
    </>
  );
}

