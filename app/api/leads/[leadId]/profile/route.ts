import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type TimelineEvent = {
  type: string;
  summary: string;
  created_at: string;
  direction?: string;
  is_hot?: boolean;
};

type Task = {
  id: string;
  title: string;
  due_at: string | null;
  status: string;
};

async function resolveContactIdForLead(supabase: any, lead: any, userId: string) {
  if (lead?.contact_id) return lead.contact_id as string;
  if (!lead?.email) return null;

  const accountId = lead.account_id || userId;
  const workspaceId = lead.workspace_id;

  let contactQuery = supabase
    .from("contacts")
    .select("id")
    .ilike("email", lead.email)
    .limit(1);

  if (accountId) {
    contactQuery = contactQuery.or(
      `account_id.eq.${accountId},workspace_id.eq.${workspaceId}`
    );
  } else if (workspaceId) {
    contactQuery = contactQuery.eq("workspace_id", workspaceId);
  }

  const { data: contact } = await contactQuery.maybeSingle();
  return contact?.id || null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const supabase = createClient();
  const { leadId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Load lead
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Verify access via workspace membership or owner_id
  let hasAccess = false;
  if (lead.owner_id && lead.owner_id === user.id) {
    hasAccess = true;
  } else if (lead.workspace_id) {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", lead.workspace_id)
      .maybeSingle();
    hasAccess = !!membership;
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Attach campaign name if available (drawer expects lead.campaigns?.name)
  let campaigns: { name: string | null } | null = null;
  if (lead.campaign_id) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("name")
      .eq("id", lead.campaign_id)
      .maybeSingle();
    if (campaign) campaigns = { name: campaign.name ?? null };
  }

  // Timeline events (minimal: messages only)
  const contactId = await resolveContactIdForLead(supabase, lead, user.id);
  const events: TimelineEvent[] = [];
  let lastInbound: string | null = null;
  let lastOutbound: string | null = null;

  if (contactId) {
    const { data: messages } = await supabase
      .from("messages")
      .select("direction, subject, created_at, intent, reply_summary")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(50);

    (messages || []).forEach((m: any) => {
      const dir = (m.direction || "").toLowerCase();
      const isOutbound = dir === "outbound" || dir === "outgoing";

      if (isOutbound) {
        lastOutbound = lastOutbound || m.created_at || null;
        events.push({
          type: "email_outbound",
          summary: m.subject || "Email sent",
          created_at: m.created_at,
          direction: "outbound",
        });
      } else {
        lastInbound = lastInbound || m.created_at || null;
        events.push({
          type: "email_inbound",
          summary: m.reply_summary || "Reply received",
          created_at: m.created_at,
          direction: "inbound",
          is_hot: m.intent === "hot",
        });
      }
    });
  }

  // Tasks (roofing_tasks)
  const tasks: Task[] = [];
  if (lead.workspace_id) {
    const { data: taskRows } = await supabase
      .from("roofing_tasks")
      .select("id, title, status, due_date, due_time")
      .eq("workspace_id", lead.workspace_id)
      .eq("lead_id", leadId)
      .neq("status", "done")
      .neq("status", "completed")
      .neq("status", "cancelled")
      .order("due_date", { ascending: true })
      .limit(25);

    (taskRows || []).forEach((t: any) => {
      const dueAt = t.due_date
        ? t.due_time
          ? new Date(`${t.due_date}T${t.due_time}`).toISOString()
          : new Date(`${t.due_date}T00:00:00`).toISOString()
        : null;
      tasks.push({
        id: t.id,
        title: t.title,
        status: t.status,
        due_at: dueAt,
      });
    });
  }

  return NextResponse.json(
    {
      lead: {
        ...lead,
        campaigns,
      },
      events,
      tasks,
      last_inbound: lastInbound,
      last_outbound: lastOutbound,
    },
    { status: 200 }
  );
}








