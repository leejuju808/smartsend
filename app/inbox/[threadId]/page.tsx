import { getPausedState } from "../../../lib/data/inbox-paused";
import { coalesceThreadByKey } from "../../../lib/data/thread-coalesce";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import NudgeButton from "./NudgeButton";
import ThreadNudgeBadge from "@/components/inbox/ThreadNudgeBadge";
import ThreadNudgeHistory from "@/components/inbox/ThreadNudgeHistory";
import ResumeBanner from "../components/ResumeBanner";
import { ResumeSoonBanner } from "@/app/(inbox)/thread/[id]/ResumeSoonBanner";
import { NeutralNudgeButton } from "@/app/(inbox)/thread/[id]/NeutralNudgeButton";
import { ThreadComposerClient } from "./ThreadComposerClient";
import { SuppressDropdown } from "@/app/(inbox)/thread/[id]/SuppressDropdown";
import { ThreadHeaderControls } from "@/app/(inbox)/thread/[id]/ThreadHeaderControls";
import { PausedBanner } from "@/app/(inbox)/thread/[id]/PausedBanner";
import { OooBanner } from "@/app/(inbox)/thread/[id]/OooBanner";
import { getThreadStatus } from "@/lib/replies";
import { Timeline } from "@/app/(inbox)/thread/[id]/components/Timeline";
import { ReplyDraft } from "@/app/(inbox)/thread/[id]/components/ReplyDraft";
import IntentChips from "@/app/(inbox)/thread/[id]/IntentChips";
import { SignaturePanel } from "@/app/(inbox)/thread/[id]/SignaturePanel";
import { SignatureHighlights } from "@/app/(inbox)/thread/[id]/SignatureHighlights";
import { ThreadIntelCard } from "@/app/(inbox)/thread/[id]/ThreadIntelCard";
import { SignatureCard } from "@/app/(inbox)/thread/[id]/SignatureCard";
import { MeetingDraftCard } from "@/app/(inbox)/thread/[id]/MeetingDraftCard";
import { RoofMeasurementCard } from "@/components/inbox/RoofMeasurementCard";
import { InternalNotesPanel } from "@/components/inbox/InternalNotesPanel";
import { LeadNotesSidebar } from "@/components/inbox/LeadNotesSidebar";
import { AssignmentDropdown } from "@/components/inbox/AssignmentDropdown";
import { StatusWorkflowButtons } from "@/components/inbox/StatusWorkflowButtons";
import { ThreadStateButtons } from "@/components/inbox/ThreadStateButtons";

async function getThreadResumeAt(threadId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data } = await sb
    .from("v_threads_resume")
    .select("resume_at")
    .eq("thread_id", threadId)
    .maybeSingle();

  return data?.resume_at ?? null;
}

async function resolveThreadIds(threadId: string): Promise<{
  campaignId: string | null;
  leadId: string | null;
}> {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  // Try to get from campaign_logs first (if threadId maps to campaign_logs.id)
  const { data: log } = await sb
    .from("campaign_logs")
    .select("campaign_id, lead_id")
    .eq("id", threadId)
    .maybeSingle();

  if (log?.campaign_id) {
    return {
      campaignId: log.campaign_id,
      leadId: log.lead_id ?? null,
    };
  }

  // Fallback: try to get from emails table
  const { data: email } = await sb
    .from("emails")
    .select("campaign_id, lead_id")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (email) {
    return {
      campaignId: email.campaign_id ?? null,
      leadId: email.lead_id ?? null,
    };
  }

  return { campaignId: null, leadId: null };
}

async function getThreadActivity(threadId: string): Promise<{
  last_inbound_at: string | null;
  last_nudge_at: string | null;
} | null> {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data } = await sb
    .from("v_thread_activity")
    .select("last_inbound_at,last_nudge_at")
    .eq("thread_id", threadId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return {
    last_inbound_at: data.last_inbound_at ?? null,
    last_nudge_at: data.last_nudge_at ?? null,
  };
}

async function getComposerContext(threadId: string, campaignId: string, leadId: string) {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  await coalesceThreadByKey(sb, threadId);

  const {
    data: { user },
  } = await sb.auth.getUser();

  const { data: thread } = await sb
    .from("inbox_threads")
    .select(
      "reply_label, replied_at, last_reply_intent, last_reply_confidence, last_classifier, assigned_to, is_suppressed, suppressed_at, suppressed_reason, needs_review, is_replied",
    )
    .eq("id", threadId)
    .maybeSingle();

  const { data: campaign } = await sb
    .from("campaigns")
    .select("account_id")
    .eq("id", campaignId)
    .maybeSingle();

  const fallbackAccountId =
    process.env.MANUAL_SEND_ACCOUNT_ID ?? process.env.DEFAULT_SEND_ACCOUNT_ID ?? null;
  const accountId = campaign?.account_id ?? fallbackAccountId ?? null;

  let fromEmail = "";
  if (accountId) {
    const { data: mailAccount } = await sb
      .from("mail_accounts")
      .select("email")
      .eq("id", accountId)
      .maybeSingle();
    if (mailAccount?.email) {
      fromEmail = mailAccount.email;
    }
  }

  const { data: lead } = await sb
    .from("leads")
    .select("email, is_muted")
    .eq("id", leadId)
    .maybeSingle();

  const { data: intent } = await sb
    .from("meeting_intents")
    .select("id")
    .eq("thread_id", threadId)
    .maybeSingle();

  let calendarId: string | null = null;
  if (user?.id) {
    const { data: primaryCalendar } = await sb
      .from("calendars")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (primaryCalendar?.id) {
      calendarId = primaryCalendar.id;
    } else {
      const { data: firstCalendar } = await sb
        .from("calendars")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      calendarId = firstCalendar?.id ?? null;
    }
  }

  return {
    accountId,
    fromEmail,
    toEmail: lead?.email ?? "",
    leadMuted: Boolean(lead?.is_muted),
    initialLabel: (thread?.reply_label ?? null) as
      | "positive"
      | "neutral"
      | "question"
      | "negative"
      | "ooo"
      | null,
    calendarId,
    threadMeta: {
      repliedAt: thread?.replied_at ?? null,
      lastReplyIntent: (thread?.last_reply_intent ?? null) as
        | "ooo"
        | "unsubscribe"
        | "positive"
        | "negative"
        | "question"
        | "routing"
        | "neutral"
        | "unknown"
        | null,
      lastReplyConfidence:
        typeof thread?.last_reply_confidence === "number" ? thread.last_reply_confidence : null,
      lastClassifier: (thread?.last_classifier ?? null) as string | null,
      isReplied: Boolean(thread?.is_replied),
    },
    assignedTo: thread?.assigned_to ?? null,
    isSuppressed: Boolean(thread?.is_suppressed),
    suppressedAt: thread?.suppressed_at ?? null,
    suppressedReason: thread?.suppressed_reason ?? null,
    needsReview: Boolean(thread?.needs_review),
    meetingIntentId: intent?.id ?? null,
  };
}

async function getLatestInboundMessageId(threadId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data } = await sb
    .from("messages")
    .select("id")
    .eq("thread_id", threadId)
    .eq("direction", "inbound")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

async function getThreadCollaborationData(
  threadId: string,
  campaignId: string | null,
  leadId: string | null
): Promise<{ status: string; state: string; assignedTo: string | null }> {
  if (!campaignId || !leadId) {
    return { status: "open", state: "open", assignedTo: null };
  }

  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  // Try to find reply_thread by campaign_id and lead_id
  const { data: replyThread } = await sb
    .from("reply_threads")
    .select("status, state, assigned_to")
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId)
    .maybeSingle();

  return {
    status: replyThread?.status ?? "open",
    state: replyThread?.state ?? "open",
    assignedTo: replyThread?.assigned_to ?? null,
  };
}

export default async function ThreadPage({
  params,
}: {
  params: { threadId: string };
}) {
  const { campaignId, leadId } = await resolveThreadIds(params.threadId);

  if (!campaignId || !leadId) {
    return (
      <main className="flex h-full">
        <section className="flex-1 border-l p-6">
          <div className="text-muted-foreground">
            Could not resolve campaign or lead for this thread.
          </div>
        </section>
      </main>
    );
  }

  const status = await getThreadStatus(params.threadId);
  const paused = await getPausedState(campaignId, leadId, params.threadId);
  const resumeAt = await getThreadResumeAt(params.threadId);
  const activity = await getThreadActivity(params.threadId);
  const composer = await getComposerContext(params.threadId, campaignId, leadId);
  const latestInboundMessageId = await getLatestInboundMessageId(params.threadId);
  const collaborationData = await getThreadCollaborationData(
    params.threadId,
    campaignId,
    leadId
  );
  const threadMeta = composer.threadMeta ?? {
    repliedAt: null,
    lastReplyIntent: null,
    lastReplyConfidence: null,
    lastClassifier: null,
    isReplied: false,
  };
  const pauseReason = paused.thread.autoPausedReason ?? paused.lead.reason ?? null;
  const pauseUntil = paused.thread.autoPausedUntil ?? paused.lead.pausedUntil ?? null;
  const isThreadPaused = paused.thread.autoPaused || paused.lead.isPaused;

  const courtesyDueAtRaw = paused.thread.autoPausedUntil ?? paused.thread.autoNudgeDueAt ?? null;
  const courtesyDueAt =
    courtesyDueAtRaw && !Number.isNaN(new Date(courtesyDueAtRaw).getTime())
      ? new Date(courtesyDueAtRaw)
      : null;

  const threadIntent = typeof paused.thread.aiIntent === "string" ? paused.thread.aiIntent.toLowerCase() : "";
  const lastIntent =
    typeof threadMeta.lastReplyIntent === "string" ? threadMeta.lastReplyIntent.toLowerCase() : "";
  const pauseReasonIntent = typeof pauseReason === "string" ? pauseReason.toLowerCase() : "";
  const isOooIntent =
    threadIntent === "out_of_office" ||
    threadIntent === "ooo" ||
    lastIntent === "out_of_office" ||
    lastIntent === "ooo" ||
    pauseReasonIntent === "ooo";
  const showCourtesyHint = Boolean(isThreadPaused && isOooIntent && courtesyDueAt);

  const shouldShowResumeSoon = resumeAt
    ? (() => {
        const resumeTime = new Date(resumeAt);
        if (Number.isNaN(resumeTime.getTime())) return false;
        const diff = resumeTime.getTime() - Date.now();
        return diff > 0 && diff <= 24 * 60 * 60 * 1000;
      })()
    : false;

  return (
    <main className="flex h-full">
      <section className="flex flex-1 flex-col border-l">
        <div className="border-b px-4 py-3">
          <div className="space-y-3">
            <ThreadHeaderControls
              repliedAt={threadMeta.repliedAt}
              pausedUntil={pauseUntil}
              pausedReason={pauseReason}
              lastReplyIntent={threadMeta.lastReplyIntent}
              leadId={leadId}
              campaignId={campaignId}
              threadId={params.threadId}
              assignedTo={composer.assignedTo ?? null}
              isLeadPaused={isThreadPaused}
              isSuppressed={composer.isSuppressed ?? false}
              aiIntent={paused.thread.aiIntent ?? null}
              needsReview={composer.needsReview ?? false}
              isReplied={threadMeta.isReplied ?? false}
              leadMuted={composer.leadMuted ?? false}
              replyStatus={status}
              meetingIntentId={composer.meetingIntentId ?? null}
              latestInboundMessageId={latestInboundMessageId ?? null}
            />
            <OooBanner threadId={params.threadId} />
            <IntentChips threadId={params.threadId} />
            {latestInboundMessageId ? (
              <SignatureHighlights messageId={latestInboundMessageId} />
            ) : null}
            {showCourtesyHint && courtesyDueAt ? (
              <div className="text-xs text-zinc-500">
                Courtesy follow-up scheduled for {courtesyDueAt.toLocaleString()}.
              </div>
            ) : null}
            {latestInboundMessageId ? <SignaturePanel messageId={latestInboundMessageId} /> : null}
            <Timeline threadId={params.threadId} />
          </div>
        </div>
        {isThreadPaused && (
          <div className="px-4 pt-3">
            <PausedBanner isPaused reason={pauseReason} until={pauseUntil} />
          </div>
        )}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-medium text-muted-foreground">
            Thread actions
          </div>
          <div className="flex items-center gap-2">
            <SuppressDropdown
              email={composer.toEmail}
              accountId={composer.accountId}
              campaignId={campaignId}
            />
            <ThreadNudgeBadge threadId={params.threadId} />
            <NeutralNudgeButton
              threadId={params.threadId}
              activity={
                activity
                  ? {
                      lastInboundAt: activity.last_inbound_at,
                      lastNudgeAt: activity.last_nudge_at,
                    }
                  : undefined
              }
            />
            <NudgeButton threadId={params.threadId} />
          </div>
        </div>
        <div className="border-b px-4 py-3">
          <ThreadNudgeHistory threadId={params.threadId} />
        </div>
        {shouldShowResumeSoon && (
          <div className="border-b px-4 py-3">
            <ResumeSoonBanner resumeAt={resumeAt} />
          </div>
        )}
        {(paused.campaign.isPaused || paused.lead.isPaused) && (
          <ResumeBanner
            campaignId={campaignId}
            leadId={leadId}
            paused={paused}
          />
        )}
        <div className="flex-1 overflow-auto p-6">
          <p className="text-sm text-muted-foreground">
            Thread view content goes here...
          </p>
        </div>
        <div className="border-t px-6 py-5 space-y-4">
          <ReplyDraft threadId={params.threadId} />
          {composer.accountId && composer.fromEmail && composer.toEmail ? (
            <ThreadComposerClient
              threadId={params.threadId}
              campaignId={campaignId}
              leadId={leadId}
              accountId={composer.accountId}
              fromEmail={composer.fromEmail}
              toEmail={composer.toEmail}
              initialLabel={composer.initialLabel}
              calendarId={composer.calendarId ?? undefined}
            />
          ) : (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Cannot run preflight — missing sender or recipient metadata.
            </div>
          )}
        </div>
      </section>
      <aside className="hidden w-full max-w-xs shrink-0 border-l bg-muted/10 px-4 py-6 lg:block xl:max-w-sm">
        <div className="space-y-4">
          <ThreadIntelCard threadId={params.threadId} />
          <RoofMeasurementCard threadId={params.threadId} />
          {leadId ? <SignatureCard leadId={leadId} /> : null}
          <MeetingDraftCard threadId={params.threadId} />
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-2 block">Assignment</label>
              <AssignmentDropdown
                threadId={params.threadId}
                assignedTo={collaborationData.assignedTo ?? composer.assignedTo ?? null}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <StatusWorkflowButtons
                threadId={params.threadId}
                status={collaborationData.status}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Thread State</label>
              <ThreadStateButtons
                threadId={params.threadId}
                state={collaborationData.state}
              />
            </div>
            <InternalNotesPanel threadId={params.threadId} />
            {leadId && <LeadNotesSidebar leadId={leadId} />}
          </div>
        </div>
      </aside>
    </main>
  );
}
