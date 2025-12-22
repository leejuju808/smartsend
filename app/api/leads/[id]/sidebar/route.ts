import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createClient();
  const { id } = await params;
  const leadId = id;

  // Lead identity
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (leadError) {
    return NextResponse.json({ error: leadError.message }, { status: 400 });
  }

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Get stages for this workspace
  const workspaceId = await getCurrentWorkspaceId();
  let stages = [];
  if (workspaceId) {
    const { data: stagesData } = await supabase
      .from("crm_stages")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true });
    stages = stagesData || [];
  }

  // Tags (stored as text[] on leads table)
  const tags = (lead.tags as string[] | null) || [];

  // Notes (latest 5)
  const { data: notes } = await supabase
    .from("lead_notes")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(5);

  // Timeline (last 5 events)
  const { data: timeline } = await supabase
    .from("lead_timeline_events")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(5);

  // Campaign participation
  const { data: campaigns } = await supabase
    .from("campaign_leads")
    .select("campaign_id, status")
    .eq("lead_id", leadId);

  // Quick metrics - count all events (not just last 5)
  const { data: allTimelineEvents } = await supabase
    .from("lead_timeline_events")
    .select("event_type")
    .eq("lead_id", leadId);

  const metrics = {
    emails_sent: allTimelineEvents?.filter((e) => e.event_type === "email_sent").length || 0,
    opens: allTimelineEvents?.filter((e) => e.event_type === "email_open").length || 0,
    clicks: allTimelineEvents?.filter((e) => e.event_type === "email_click").length || 0,
    replies: allTimelineEvents?.filter((e) => e.event_type === "email_reply").length || 0,
  };

  // Get AI extracted fields for this lead (latest per thread)
  const { data: extractedFields } = await supabase
    .from("ai_extracted_fields")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    lead,
    tags: tags.map((name, index) => ({ id: `tag-${index}`, name })),
    notes: notes || [],
    timeline: timeline || [],
    campaigns: campaigns || [],
    metrics,
    aiData: extractedFields || null,
    stages,
  });
}

