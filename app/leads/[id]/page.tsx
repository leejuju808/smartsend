import { LeadSidebar } from "@/components/leads/lead-sidebar";
import { LeadTimeline } from "@/components/leads/lead-timeline";
import { LeadActivityTimeline } from "@/components/leads/lead-activity-timeline";
import { LeadActivityTimelineV2 } from "@/components/leads/lead-activity-timeline-v2";
import { LeadActivitySummary } from "@/components/leads/lead-activity-summary";
import { CampaignHistory } from "@/components/leads/campaign-history";
import { RepliesPanel } from "@/components/leads/replies-panel";
import { TasksPanel } from "@/components/leads/tasks-panel";
import { LeadNotesPanel } from "./LeadNotesPanel";
import { LeadAiSdrPanel } from "./LeadAiSdrPanel";
import { LeadReplyInsights } from "./LeadReplyInsights";
import { TimelineTab } from "./TimelineTab";
import { LeadStatusBar } from "./LeadStatusBar";
import { LeadNotes } from "@/components/lead/LeadNotes";
import { AuditLogViewer } from "@/components/leads/audit-log-viewer";
import { TranscriptViewer } from "@/components/transcript/TranscriptViewer";
import { LossReasonPanel } from "@/components/lead/LossReasonPanel";
import { ExperiencePanel } from "@/components/experience/ExperiencePanel";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

async function getFullLeadProfile(leadId: string) {
  const supabase = createClient();
  
  // Fetch all data in parallel
  const [
    { data: lead, error: leadError },
    { data: threads },
    { data: tasks },
    { data: notes },
    { data: logs },
    { data: activities },
    { data: deals },
    { data: activityEvents },
    { data: sendRows },
    { data: replies },
    { data: suppression },
  ] = await Promise.all([
    supabase.from("leads").select("*").eq("id", leadId).single(),
    supabase
      .from("reply_threads")
      .select("*")
      .eq("lead_id", leadId)
      .order("last_message_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
    supabase
      .from("lead_notes")
      .select("*")
      .eq("lead_id", leadId)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("message_logs")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
    supabase
      .from("lead_activity")
      .select("*")
      .eq("lead_id", leadId)
      .order("occurred_at", { ascending: false })
      .limit(200),
    supabase
      .from("deals")
      .select("id, stage")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
    supabase
      .from("lead_activity_events")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("send_queue")
      .select("id, source, status, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
    supabase
      .from("lead_replies")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
  ]);

  if (leadError || !lead) {
    return null;
  }

  // Fetch suppression status after we have the lead
  const { data: suppression } = lead.workspace_id && lead.email
    ? await supabase
        .from("global_suppressions")
        .select("id, active, reason")
        .eq("workspace_id", lead.workspace_id)
        .eq("email", lead.email.toLowerCase())
        .eq("active", true)
        .maybeSingle()
    : { data: null, error: null };

  // Fetch personas after we have the lead
  const { data: personas } = lead.org_id
    ? await supabase
        .from("sdr_personas")
        .select("id, name")
        .eq("org_id", lead.org_id)
        .order("created_at", { ascending: true })
    : { data: null, error: null };

  // Fetch email events
  const { data: emailEvents } = await supabase
    .from("email_events")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(100);

  // Fetch tracking events
  const { data: trackingEvents } = await supabase
    .from("tracking_events")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(100);

  // Fetch campaign participation
  const { data: campaignLeads } = await supabase
    .from("campaign_leads")
    .select("campaign_id, status, created_at")
    .eq("lead_id", leadId);

  // Get campaign names
  const campaignIds = (campaignLeads || []).map((cl) => cl.campaign_id).filter(Boolean);
  const { data: campaigns } = campaignIds.length > 0
    ? await supabase
        .from("campaigns")
        .select("id, name")
        .in("id", campaignIds)
    : { data: null, error: null };

  const campaignMap = new Map((campaigns || []).map((c: any) => [c.id, c.name]));

  // Build campaign history from message_logs
  const campaignHistory = (logs || []).map((log: any) => {
    const campaignName = campaignMap.get(log.campaign_id) || "Unknown Campaign";
    return {
      campaign_id: log.campaign_id,
      campaign_name: campaignName,
      step: log.step_no || null,
      status: log.status || "sent",
      replied: log.reply_detected || false,
      reply_date: log.replied_at || null,
      variant: log.variant_id || null,
      sent_at: log.created_at,
    };
  });

  // Build unified timeline events
  const timelineEvents: any[] = [];

  // Add replies from threads
  (threads || []).forEach((thread: any) => {
    timelineEvents.push({
      id: `thread-${thread.id}`,
      type: "reply",
      created_at: thread.last_message_at || thread.created_at,
      data: thread,
    });
  });

  // Add notes
  (notes || []).forEach((note: any) => {
    timelineEvents.push({
      id: `note-${note.id}`,
      type: "note",
      created_at: note.created_at,
      data: note,
    });
  });

  // Add tasks
  (tasks || []).forEach((task: any) => {
    timelineEvents.push({
      id: `task-${task.id}`,
      type: "task",
      created_at: task.created_at,
      data: task,
    });
  });

  // Add email events
  (emailEvents || []).forEach((event: any) => {
    timelineEvents.push({
      id: `email-event-${event.id}`,
      type: event.event_type || "email_event",
      created_at: event.created_at,
      data: event,
    });
  });

  // Add tracking events
  (trackingEvents || []).forEach((event: any) => {
    timelineEvents.push({
      id: `tracking-${event.id}`,
      type: event.event || event.kind || "tracking",
      created_at: event.created_at,
      data: event,
    });
  });

  // Add message logs (sends)
  (logs || []).forEach((log: any) => {
    timelineEvents.push({
      id: `send-${log.id}`,
      type: "email_sent",
      created_at: log.created_at,
      data: log,
    });
  });

  // Sort timeline by date (newest first)
  timelineEvents.sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA;
  });

  // Compute touch stats
  const aiEmails = (sendRows ?? []).filter(
    (s) => s.source === "ai_sdr" && s.status === "sent",
  );
  const humanEmails = (sendRows ?? []).filter(
    (s) => (s.source === null || s.source === "campaign") && s.status === "sent",
  );
  const totalReplies = (replies ?? []).length;
  const interestedReplies = (replies ?? []).filter((r) =>
    ["ready_to_meet", "open_to_chat", "needs_info", "follow_up_later"].includes(
      r.intent_label || "",
    ),
  ).length;

  const latestReply = (replies ?? [])[0] ?? null;

  let lastTouch: { type: string; created_at: string } | null = null;
  const allTouchEvents: { type: string; created_at: string }[] = [
    ...aiEmails.map((s) => ({ type: "ai_email", created_at: s.created_at })),
    ...humanEmails.map((s) => ({
      type: "human_email",
      created_at: s.created_at,
    })),
    ...(replies ?? []).map((r) => ({ type: "reply", created_at: r.created_at })),
  ];

  if (allTouchEvents.length > 0) {
    allTouchEvents.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    lastTouch = allTouchEvents[0];
  }

  const touchStats = {
    aiEmailsCount: aiEmails.length,
    humanEmailsCount: humanEmails.length,
    totalReplies,
    interestedReplies,
    lastTouch,
  };

  return {
    lead,
    threads: threads || [],
    tasks: tasks || [],
    notes: notes || [],
    logs: logs || [],
    timeline: timelineEvents,
    campaignHistory,
    activities: activities || [],
    deals: deals || [],
    activityEvents: activityEvents || [],
    touchStats,
    personas: personas || [],
    suppression: suppression || null,
  };
}

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const leadId = id;

  const data = await getFullLeadProfile(leadId);
  
  if (!data) {
    notFound();
  }

  const { lead, threads, tasks, notes, logs, timeline, campaignHistory, activities, deals, activityEvents, touchStats, personas, suppression } = data;

  if (!lead) {
    notFound();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left Column - Lead Details Panel (Sticky) */}
      <div className="w-80 border-r bg-background flex-shrink-0">
        <LeadSidebar lead={lead} leadId={leadId} suppression={suppression} />
      </div>

      {/* Right Column - Tabs with Activity Timeline (Scrollable) */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Block 8490 — Lead Status & Follow-Up Controls */}
          <LeadStatusBar
            leadId={leadId}
            initialStatus={(lead.status ?? "open") as "open" | "in_progress" | "won" | "lost" | "do_not_contact"}
            initialNextFollowUpAt={lead.next_follow_up_at}
          />
          
          {/* Block 22210 — Loss Reason Detector v1 */}
          {lead.status === "lost" && (
            <LossReasonPanel
              lossReason={lead.loss_reason}
              lossReasonDetails={lead.loss_reason_details}
              lossAnalysis={lead.loss_analysis as any}
              confidence={lead.reason_confidence}
            />
          )}
          
          <Tabs defaultValue="timeline" className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="space-y-6 mt-6">
              {/* Block 11200 — SmartSend Lead Timeline v1 */}
              <TimelineTab leadId={leadId} lead={lead} />
            </TabsContent>

            <TabsContent value="transcript" className="space-y-6 mt-6">
              {/* Block 22126 — SmartSend Roofing Homeowner Transcript v1 (AI Conversation Intelligence) */}
              <div className="h-[calc(100vh-300px)] border border-gray-800 rounded-lg bg-gray-900/50">
                <TranscriptViewer leadId={leadId} />
              </div>
            </TabsContent>

            <TabsContent value="notes" className="space-y-6 mt-6">
              {/* Block 21739 — SmartSend Roofing Lead Notes & Internal Mentions v1 */}
              <LeadNotes leadId={leadId} />
            </TabsContent>

            <TabsContent value="overview" className="space-y-8 mt-6">
              {/* Block 22237 — Homeowner Experience Score v2 Panel */}
              <ExperiencePanel
                leadId={leadId}
                experienceScore={lead?.homeowner_experience_score}
                experienceTrend={lead?.experience_trend as "improving" | "declining" | "stable" | null}
                experienceScoreTrend={lead?.experience_score_trend}
                experienceLastUpdated={lead?.experience_last_updated || lead?.last_experience_update}
                reason={null} // Can be fetched from timeline events if needed
              />

              {/* Campaign History */}
              {campaignHistory && campaignHistory.length > 0 && (
                <CampaignHistory history={campaignHistory} />
              )}

              {/* Replies Panel */}
              {threads && threads.length > 0 && (
                <RepliesPanel threads={threads} />
              )}

              {/* Tasks Panel */}
              <TasksPanel leadId={leadId} tasks={tasks || []} />

              {/* Legacy Timeline */}
              <LeadTimeline events={timeline || []} />
            </TabsContent>

            <TabsContent value="activity" className="space-y-6 mt-6">
              {/* At a Glance Summary */}
              <LeadActivitySummary activities={activities} deals={deals} />

              {/* Unified Activity Timeline (new lead_activity_events table) */}
              <LeadActivityTimelineV2 events={activityEvents} />

              {/* Legacy Activity Timeline (fallback) */}
              <LeadActivityTimeline activities={activities} leadId={leadId} />
            </TabsContent>

            <TabsContent value="advanced" className="space-y-6 mt-6">
              {/* Block 21947 — SmartSend Roofing Lead Audit Log v1 */}
              <AuditLogViewer leadId={leadId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right Sidebar - Notes Panel */}
      <div className="w-80 border-l bg-background flex-shrink-0 overflow-y-auto">
        <div className="p-6 space-y-4">
          <LeadReplyInsights lead={lead} latestReply={latestReply} />
          <LeadAiSdrPanel lead={lead} touchStats={touchStats} personas={personas || []} />
          <LeadNotesPanel leadId={leadId} initialNotes={notes || []} />
        </div>
      </div>
    </div>
  );
}

