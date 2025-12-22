// app/api/campaigns/[campaignId]/lead-thread/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
  req: Request,
  { params }: { params: { campaignId: string } }
) {
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId");

  if (!leadId) {
    return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });

  const campaignId = params.campaignId;

  // 1. Get campaign_leads + lead info + summary fields
  const { data: cl, error: clError } = await supabase
    .from("campaign_leads")
    .select(
      `
      id,
      campaign_id,
      lead_id,
      status,
      status_enum,
      last_reply_intent,
      thread_summary,
      thread_stage,
      thread_next_action,
      thread_priority,
      lead:leads (
        name,
        email
      )
    `
    )
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId)
    .single();

  if (clError || !cl) {
    return NextResponse.json(
      { error: "Campaign lead not found" },
      { status: 404 }
    );
  }

  // 2. Get sends - try campaign_sends first, fallback to send_logs
  let sends: any[] = [];
  
  const { data: campaignSends } = await supabase
    .from("campaign_sends")
    .select(
      `
      id,
      sent_at,
      subject,
      body,
      from_email,
      to_email
    `
    )
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: true });

  if (campaignSends && campaignSends.length > 0) {
    sends = campaignSends;
  } else {
    // Fallback to send_logs
    const { data: sendLogs } = await supabase
      .from("send_logs")
      .select(
        `
        id,
        sent_at,
        subject,
        html_rendered,
        body_preview,
        to_email,
        recipient_email
      `
      )
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: true });

    if (sendLogs) {
      sends = sendLogs.map((log) => ({
        id: log.id,
        sent_at: log.sent_at,
        subject: log.subject,
        body: log.html_rendered || log.body_preview || "",
        from_email: null,
        to_email: log.to_email || log.recipient_email,
      }));
    }
  }

  // 3. Get replies
  const { data: replies } = await supabase
    .from("campaign_replies")
    .select(
      `
      id,
      created_at,
      subject,
      raw_text,
      from_email,
      to_email,
      intent,
      sentiment
    `
    )
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  type TimelineItem = {
    id: string;
    type: "sent" | "reply";
    at: string;
    subject?: string | null;
    body: string;
    from_email?: string | null;
    to_email?: string | null;
    intent?: string | null;
    sentiment?: string | null;
  };

  const timeline: TimelineItem[] = [];

  (sends ?? []).forEach((s) => {
    timeline.push({
      id: `send_${s.id}`,
      type: "sent",
      at: s.sent_at,
      subject: s.subject,
      body: s.body ?? "",
      from_email: s.from_email,
      to_email: s.to_email,
    });
  });

  (replies ?? []).forEach((r) => {
    timeline.push({
      id: `reply_${r.id}`,
      type: "reply",
      at: r.created_at,
      subject: r.subject,
      body: r.raw_text ?? "",
      from_email: r.from_email,
      to_email: r.to_email,
      intent: r.intent,
      sentiment: r.sentiment,
    });
  });

  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // Get lead name - try from the join first, then from leads table
  let leadName: string | null = null;
  let leadEmail: string = "";

  if (cl.lead && typeof cl.lead === "object" && "name" in cl.lead) {
    leadName = (cl.lead as any).name;
    leadEmail = (cl.lead as any).email || "";
  } else {
    // Fallback: fetch from leads table
    const { data: lead } = await supabase
      .from("leads")
      .select("name, email, first_name, last_name")
      .eq("id", leadId)
      .single();

    if (lead) {
      leadName = lead.name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || null;
      leadEmail = lead.email || "";
    }
  }

  // Map status: prefer status_enum, otherwise map text status to enum values
  let mappedStatus: "active" | "completed" | "replied" | "unsubscribed" | "bounced" | "error" = "active";
  
  if (cl.status_enum) {
    mappedStatus = cl.status_enum as any;
  } else if (cl.status) {
    // Map text status to enum values
    const statusMap: Record<string, typeof mappedStatus> = {
      replied: "replied",
      unsub: "unsubscribed",
      unsubscribed: "unsubscribed",
      bounced: "bounced",
      completed: "completed",
      error: "error",
      failed: "error",
    };
    mappedStatus = statusMap[cl.status] || "active";
  }

  return NextResponse.json({
    id: cl.id,
    lead_id: cl.lead_id,
    name: leadName,
    email: leadEmail,
    status: mappedStatus,
    last_reply_intent: cl.last_reply_intent,
    thread_summary: cl.thread_summary,
    thread_stage: cl.thread_stage,
    thread_next_action: cl.thread_next_action,
    thread_priority: cl.thread_priority,
    timeline,
  });
}

