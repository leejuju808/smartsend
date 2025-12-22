// app/api/leads/[id]/activity/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  const leadId = params.id;

  // lead
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // sends
  const { data: sends } = await supabase
    .from("send_queue")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at");

  // opens + clicks
  const { data: events } = await supabase
    .from("email_events")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at");

  // replies
  const { data: replies } = await supabase
    .from("email_replies")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at");

  // bounces
  const { data: bounces } = await supabase
    .from("email_bounces")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at");

  // unsubscribes
  const { data: unsubs } = await supabase
    .from("unsubscribes")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at");

  // notes
  const { data: notes } = await supabase
    .from("lead_notes")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at");

  return NextResponse.json({
    lead,
    sends: sends ?? [],
    events: events ?? [],
    replies: replies ?? [],
    bounces: bounces ?? [],
    unsubs: unsubs ?? [],
    notes: notes ?? [],
  });
}

