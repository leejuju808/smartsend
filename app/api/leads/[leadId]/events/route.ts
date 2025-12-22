import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Block 11200 — SmartSend Lead Timeline v1
 * GET /api/leads/:leadId/events
 * Returns all events for a lead in chronological order (newest first)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const supabase = createClient();
  const { leadId } = await params;

  // Get current user for auth
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify lead exists and user has access
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, workspace_id")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Fetch events
  const { data: events, error: eventsError } = await supabase
    .from("lead_events")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (eventsError) {
    console.error("Error fetching lead events:", eventsError);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }

  // Fetch proposal events and convert to timeline format
  const { data: proposalEvents, error: proposalEventsError } = await supabase
    .from("proposal_events")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (proposalEventsError) {
    console.error("Error fetching proposal events:", proposalEventsError);
  }

  // Convert proposal events to timeline format
  const proposalTimelineEvents = (proposalEvents || []).map((pe) => {
    let content = "";
    let type: string = "action_suggested";

    switch (pe.event_type) {
      case "proposal_sent":
        content = `Proposal sent — $${pe.metadata?.amount?.toLocaleString() || "N/A"}`;
        type = "email_sent";
        break;
      case "proposal_viewed":
        content = "Proposal viewed — homeowner opened the file";
        type = "reply_received";
        break;
      case "proposal_followup":
        content = "Auto follow-up scheduled";
        type = "followup_triggered";
        break;
      case "proposal_reply":
        const intent = pe.metadata?.intent || "unknown";
        const message = pe.metadata?.message || "";
        content = `AI marked reply as ${intent} — ${message.substring(0, 100)}${message.length > 100 ? "..." : ""}`;
        type = "classified";
        break;
    }

    return {
      id: pe.id,
      type,
      content,
      metadata: pe.metadata,
      created_at: pe.created_at,
    };
  });

  // Merge and sort all events
  const allEvents = [...(events || []), ...proposalTimelineEvents].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return NextResponse.json({
    events: allEvents.slice(0, 100), // Limit to 100 most recent
  });
}
















