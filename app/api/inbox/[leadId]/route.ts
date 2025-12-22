// app/api/inbox/[leadId]/route.ts
// Block 8790 — Inbox v1: Unified Roofing Reply Center
// Get full thread for a lead (inbound + outbound messages)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { leadId: string } }
) {
  const supabase = createClient();
  const leadId = params.leadId;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Load inbound emails for this lead
  const { data: inbound } = await supabase
    .from("inbound_emails")
    .select("id, body_text, received_at, classification")
    .eq("lead_id", leadId)
    .eq("owner_id", user.id)
    .order("received_at", { ascending: true });

  // If no inbound emails found, try by from_email via lead lookup
  let inboundData = inbound || [];
  if (inboundData.length === 0) {
    const { data: lead } = await supabase
      .from("leads")
      .select("email")
      .eq("id", leadId)
      .maybeSingle();
    
    if (lead?.email) {
      const { data: inboundByEmail } = await supabase
        .from("inbound_emails")
        .select("id, body_text, received_at, classification")
        .eq("from_email", lead.email)
        .eq("owner_id", user.id)
        .order("received_at", { ascending: true });
      inboundData = inboundByEmail || [];
    }
  }

  // Load outbound emails to that lead
  const { data: outbound } = await supabase
    .from("outbound_emails")
    .select("id, body_text, body, sent_at, status")
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: true });

  // Combine and sort messages
  const combined = [
    ...(inboundData ?? []).map((m) => ({
      ...m,
      direction: "in" as const,
      created_at: m.received_at,
    })),
    ...(outbound ?? []).map((m) => ({
      ...m,
      direction: "out" as const,
      body_text: m.body_text || m.body,
      created_at: m.sent_at,
    })),
  ].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return NextResponse.json(
    { messages: combined },
    { status: 200 }
  );
}

