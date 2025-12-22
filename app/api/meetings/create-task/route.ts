import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  const sb = createClient();
  const { suggestion_id } = await req.json();

  if (!suggestion_id) {
    return NextResponse.json({ error: "suggestion_id required" }, { status: 400 });
  }

  // Get suggestion details
  const { data: s, error: sError } = await sb
    .from("meeting_suggestions")
    .select("account_id,email_id,proposed_times")
    .eq("id", suggestion_id)
    .single();

  if (sError || !s) {
    return NextResponse.json({ error: "suggestion_not_found" }, { status: 404 });
  }

  // Get email details for lead_id and subject
  const { data: e, error: eError } = await sb
    .from("emails")
    .select("lead_id,subject")
    .eq("id", s.email_id)
    .single();

  if (eError || !e) {
    return NextResponse.json({ error: "email_not_found" }, { status: 404 });
  }

  // Create task
  const { data, error } = await sb.from("tasks").insert({
    account_id: s.account_id,
    lead_id: e.lead_id,
    kind: "meeting",
    title: `Schedule: ${e.subject ?? 'Prospect meeting'}`,
    payload: { 
      email_id: s.email_id, 
      suggestion_id, 
      proposed_times: s.proposed_times 
    }
  }).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}















