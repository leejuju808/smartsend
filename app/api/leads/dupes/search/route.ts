import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const leadId = new URL(req.url).searchParams.get("leadId");

  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Supabase environment not configured" }, { status: 500 });
  }

  const s = createClient(supabaseUrl, serviceKey);

  const queueRes = await s.rpc("queue_dupe_candidates", { p_lead: leadId });
  if (queueRes.error) {
    return NextResponse.json({ error: queueRes.error.message }, { status: 500 });
  }

  const { data, error } = await s
    .from("lead_dupe_candidates")
    .select(
      "id, other_lead_id, reason, score, leads!other_lead_id (email, first_name, last_name, company, title)"
    )
    .eq("lead_id", leadId)
    .order("score", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}


