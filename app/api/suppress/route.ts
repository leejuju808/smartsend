import { NextResponse } from "next/server";

import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { lead_id, scope = "account", reason = "manual", notes } = await req.json();

  if (!lead_id) {
    return NextResponse.json({ error: "lead_id is required" }, { status: 400 });
  }

  const supabase = await createServerClient();

  const { data: row, error } = await supabase
    .from("leads")
    .select("id, email, campaign_id, campaigns!inner(owner_id)")
    .eq("id", lead_id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { error: suppressError } = await supabase.rpc("suppress_email", {
    p_account_id: row.campaigns.owner_id,
    p_email: row.email,
    p_reason: reason,
    p_scope: scope,
    p_campaign_id: scope === "campaign" ? row.campaign_id : null,
    p_source: "manual",
    p_notes: notes ?? null,
  });

  if (suppressError) {
    return NextResponse.json({ error: suppressError.message }, { status: 400 });
  }

  const { error: threadUpdateError } = await supabase
    .from("inbox_threads")
    .update({
      is_suppressed: true,
      suppressed_at: new Date().toISOString(),
      suppressed_reason: reason,
    })
    .eq("lead_id", lead_id);

  if (threadUpdateError) {
    return NextResponse.json({ error: threadUpdateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

