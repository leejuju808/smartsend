// app/api/inbox-unified/[id]/route.ts
// Block 21420 — SmartSend Inbox UI: Reply + Intent + Tasks Panel v1
// Returns full email detail for a specific email reply

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const emailId = params.id;

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

  // Query email_reply by id
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
    .eq("id", emailId)
    .single();

  // Apply workspace filter if available
  if (workspaceIds.length > 0) {
    query = query.in("workspace_id", workspaceIds);
  }

  const { data: reply, error } = await query;

  if (error) {
    console.error("Email detail load error:", error);
    return NextResponse.json({ error: "Failed to load email" }, { status: 500 });
  }

  if (!reply) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

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
    const intentMap: Record<string, string> = {
      interested: "hot",
      booked: "hot",
      warm: "warm",
      not_interested: "not_interested",
      follow_up: "followup",
      question: "question",
      schedule: "schedule",
      ooo: null,
      unsubscribe: "not_interested",
      ambiguous: null,
    };
    intent = intentMap[intent] || intent;
  }

  // Get body text (prefer body_text, fallback to body_html)
  const body = reply.body_text || reply.body_html || "";

  return NextResponse.json(
    {
      id: reply.id,
      lead_id: reply.lead_id,
      subject: reply.subject || "(no subject)",
      body: body,
      from_name: leadName,
      from_email: reply.from_email,
      received_at: reply.received_at || reply.created_at,
      intent: intent,
    },
    { status: 200 }
  );
}














































