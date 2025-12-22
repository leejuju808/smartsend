// app/api/inbox-unified/route.ts
// Block 21420 — SmartSend Inbox UI: Reply + Intent + Tasks Panel v1
// Returns list of recent email threads/replies for the logged-in user

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get user's workspace memberships
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id);

  const workspaceIds = memberships?.map((m) => m.workspace_id) || [];

  // Query email_replies with intent and lead info
  let query = supabase
    .from("email_replies")
    .select(
      `
      id,
      from_email,
      from_name,
      subject,
      body_text,
      body_html,
      received_at,
      created_at,
      lead_id,
      workspace_id,
      intent,
      leads:lead_id (
        id,
        email,
        name,
        first_name,
        last_name
      )
    `
    )
    .order("received_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  // Apply workspace filter if available
  if (workspaceIds.length > 0) {
    query = query.in("workspace_id", workspaceIds);
  }

  const { data: replies, error } = await query;

  if (error) {
    console.error("Inbox unified load error:", error);
    return NextResponse.json({ error: "Failed to load inbox" }, { status: 500 });
  }

  // Format replies for frontend
  const formattedReplies = (replies || []).map((reply: any) => {
    const lead = reply.leads as any;
    const leadName =
      lead?.name ||
      (lead?.first_name && lead?.last_name
        ? `${lead.first_name} ${lead.last_name}`.trim()
        : null) ||
      lead?.email ||
      reply.from_name ||
      reply.from_email ||
      "Homeowner";

    // Map intent values to match spec
    let intent: string | null = reply.intent || null;
    if (intent) {
      // Map existing intent values to spec values
      const intentMap: Record<string, string> = {
        interested: "hot",
        booked: "hot",
        warm: "warm",
        not_interested: "not_interested",
        follow_up: "followup",
        question: "question",
        schedule: "schedule",
        ooo: null, // Out of office - don't show in inbox
        unsubscribe: "not_interested",
        ambiguous: null,
      };
      intent = intentMap[intent] || intent;
    }

    // Get preview from body_text or body_html
    const bodyText = reply.body_text || reply.body_html || "";
    const preview = bodyText.slice(0, 150).replace(/\n/g, " ").trim();

    return {
      id: reply.id,
      lead_id: reply.lead_id,
      subject: reply.subject || "(no subject)",
      preview: preview || "",
      received_at: reply.received_at || reply.created_at,
      from_name: leadName,
      from_email: reply.from_email,
      intent: intent,
    };
  });

  return NextResponse.json(formattedReplies, { status: 200 });
}














































