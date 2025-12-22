import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "edge";

export async function GET(_: NextRequest, { params }: { params: { leadId: string } }) {
  try {
    const leadId = params.leadId;

    const { data: emailEvents, error } = await supabaseAdmin
      .from("email_events")
      .select("id,event_type,meta,created_at,email_id,campaign_id")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching timeline:", error);
    }

    const { data: deliveryEvents, error: deliveryErr } = await supabaseAdmin
      .from("delivery_events")
      .select("id,event,meta,created_at,campaign_id,thread_id")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });

    if (deliveryErr) {
      console.error("Error fetching delivery events:", deliveryErr);
    }

    // Block 281: Fetch meetings for this lead
    const { data: meetings, error: meetingsErr } = await supabaseAdmin
      .from("meetings")
      .select("id, title, start_time, end_time, timezone, confidence, created_at, thread_id, deal_id")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });

    if (meetingsErr) {
      console.error("Error fetching meetings:", meetingsErr);
    }

    // Notes (human-touched)
    const { data: notes, error: notesErr } = await supabaseAdmin
      .from("lead_notes")
      .select("id,body,created_at,updated_at,pinned")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });

    if (notesErr) {
      console.error("Error fetching lead notes:", notesErr);
    }

    // Tasks (human-touched)
    const { data: tasks, error: tasksErr } = await supabaseAdmin
      .from("tasks")
      .select("id,title,notes,status,due_at,created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });

    if (tasksErr) {
      console.error("Error fetching lead tasks:", tasksErr);
    }

    // Manual outbound replies (human-touched): inbox_threads -> inbox_messages(outbound)
    const { data: threads, error: threadsErr } = await supabaseAdmin
      .from("inbox_threads")
      .select("id")
      .eq("lead_id", leadId);

    if (threadsErr) {
      console.error("Error fetching inbox threads:", threadsErr);
    }

    const threadIds = (threads ?? []).map((t) => t.id).filter(Boolean);
    const { data: outboundMsgs, error: msgsErr } = threadIds.length
      ? await supabaseAdmin
          .from("inbox_messages")
          .select("id,thread_id,direction,subject,created_at")
          .in("thread_id", threadIds)
          .in("direction", ["out", "outbound"])
          .order("created_at", { ascending: true })
      : { data: [], error: null };

    if (msgsErr) {
      console.error("Error fetching outbound inbox messages:", msgsErr);
    }

    // Inbox actions (human-touched): call/text/book/close/etc.
    const { data: inboxActions, error: actionsErr } = threadIds.length
      ? await supabaseAdmin
          .from("inbox_actions")
          .select("id,thread_id,action_type,performed_by,metadata,created_at")
          .in("thread_id", threadIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null };

    if (actionsErr) {
      console.error("Error fetching inbox actions:", actionsErr);
    }

    // Job funnel events (human-touched): conversions + handoff snapshots created from actions
    const { data: conversions, error: convErr } = threadIds.length
      ? await supabaseAdmin
          .from("jobs_conversions")
          .select(
            "id,thread_id,conversion_type,pipeline_stage,job_type,estimated_value,probability,expected_close_date,closed_at,notes,created_by,created_at,updated_at"
          )
          .in("thread_id", threadIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null };

    if (convErr) {
      console.error("Error fetching jobs conversions:", convErr);
    }

    const { data: handoffsByLead, error: handoffErr } = await supabaseAdmin
      .from("job_handoffs")
      .select("id,thread_id,job_type,location,notes,source,created_by,created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });

    if (handoffErr) {
      // Not all workspaces will have this table (older schemas); keep non-blocking.
      console.error("Error fetching job handoffs:", handoffErr);
    }

    type TimelineEvent = {
      id: string;
      lane: "system" | "touched";
      event_type: string;
      meta: any;
      created_at: string;
      email_id: string | null;
      campaign_id: string | null;
    };

    const system: TimelineEvent[] = [];
    const touched: TimelineEvent[] = [];

    // Email events are always system-handled (sent/open/click/reply detection etc.)
    (emailEvents ?? []).forEach((e) => {
      system.push({
        id: e.id,
        lane: "system",
        event_type: e.event_type,
        meta: e.meta ?? {},
        created_at: e.created_at,
        email_id: e.email_id ?? null,
        campaign_id: e.campaign_id ?? null,
      });
    });

    // Delivery events: some are system automation, some are human control inputs
    (deliveryEvents ?? []).forEach((ev) => {
      const meta = ev.meta ?? {};
      const event = String(ev.event || "");

      const isTouched =
        event === "manual_pause" ||
        event === "manual_resume" ||
        (event === "manual_pause" && (meta?.action === "pause" || meta?.action === "resume"));

      if (isTouched) {
        touched.push({
          id: ev.id,
          lane: "touched",
          event_type: "manual_control",
          meta: { ...meta, event },
          created_at: ev.created_at,
          email_id: ev.thread_id ?? null,
          campaign_id: ev.campaign_id ?? null,
        });
        return;
      }

      if (event === "enqueue_blocked") {
        system.push({
          id: ev.id,
          lane: "system",
          event_type: "enqueue_blocked",
          meta,
          created_at: ev.created_at,
          email_id: ev.thread_id ?? null,
          campaign_id: ev.campaign_id ?? null,
        });
        return;
      }

      if (event === "skip_due_to_ooo_guard") {
        system.push({
          id: ev.id,
          lane: "system",
          event_type: "ooo_guard_skipped",
          meta,
          created_at: ev.created_at,
          email_id: ev.thread_id ?? null,
          campaign_id: ev.campaign_id ?? null,
        });
        return;
      }

      const action = meta?.action;
      if (action === "auto_resume" || action === "auto_resume_and_requeue") {
        system.push({
          id: ev.id,
          lane: "system",
          event_type: "auto_resumed",
          meta,
          created_at: ev.created_at,
          email_id: ev.thread_id ?? null,
          campaign_id: ev.campaign_id ?? null,
        });
      }
    });

    (meetings ?? []).forEach((m) => {
      system.push({
        id: m.id,
        lane: "system",
        event_type: "meeting_scheduled",
        meta: {
          meeting_id: m.id,
          title: m.title,
          start_time: m.start_time,
          end_time: m.end_time,
          timezone: m.timezone,
          confidence: m.confidence,
          thread_id: m.thread_id,
          deal_id: m.deal_id,
        },
        created_at: m.created_at,
        email_id: m.thread_id ?? null,
        campaign_id: null,
      });
    });

    (notes ?? []).forEach((n) => {
      touched.push({
        id: n.id,
        lane: "touched",
        event_type: "note",
        meta: { body: n.body, pinned: n.pinned, updated_at: n.updated_at },
        created_at: n.created_at,
        email_id: null,
        campaign_id: null,
      });
    });

    (tasks ?? []).forEach((t) => {
      touched.push({
        id: t.id,
        lane: "touched",
        event_type: "task",
        meta: { title: t.title, notes: t.notes, status: t.status, due_at: t.due_at },
        created_at: t.created_at,
        email_id: null,
        campaign_id: null,
      });
    });

    (outboundMsgs ?? []).forEach((m) => {
      touched.push({
        id: m.id,
        lane: "touched",
        event_type: "reply_sent",
        meta: { subject: m.subject, thread_id: m.thread_id },
        created_at: m.created_at,
        email_id: m.thread_id ?? null,
        campaign_id: null,
      });
    });

    (inboxActions ?? []).forEach((a: any) => {
      touched.push({
        id: a.id,
        lane: "touched",
        event_type: "inbox_action",
        meta: {
          action_type: a.action_type,
          thread_id: a.thread_id ?? null,
          performed_by: a.performed_by ?? null,
          ...(a.metadata ?? {}),
        },
        created_at: a.created_at,
        email_id: a.thread_id ?? null,
        campaign_id: null,
      });
    });

    (conversions ?? []).forEach((c: any) => {
      touched.push({
        id: c.id,
        lane: "touched",
        event_type: "conversion",
        meta: {
          thread_id: c.thread_id ?? null,
          conversion_type: c.conversion_type ?? null,
          pipeline_stage: c.pipeline_stage ?? null,
          job_type: c.job_type ?? null,
          estimated_value: c.estimated_value ?? null,
          probability: c.probability ?? null,
          expected_close_date: c.expected_close_date ?? null,
          closed_at: c.closed_at ?? null,
          notes: c.notes ?? null,
          created_by: c.created_by ?? null,
          updated_at: c.updated_at ?? null,
        },
        created_at: c.created_at,
        email_id: c.thread_id ?? null,
        campaign_id: null,
      });
    });

    (handoffsByLead ?? []).forEach((h: any) => {
      system.push({
        id: h.id,
        lane: "system",
        event_type: "handoff_snapshot",
        meta: {
          thread_id: h.thread_id ?? null,
          job_type: h.job_type ?? null,
          location: h.location ?? null,
          notes: h.notes ?? null,
          source: h.source ?? null,
          created_by: h.created_by ?? null,
        },
        created_at: h.created_at,
        email_id: h.thread_id ?? null,
        campaign_id: null,
      });
    });

    system.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    touched.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return NextResponse.json({ lanes: { system, touched } });
  } catch (error: any) {
    console.error("Error fetching timeline:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch timeline" },
      { status: 500 }
    );
  }
}

