import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { lead_ids, campaign_id } = await req.json();
  if (!Array.isArray(lead_ids) || !campaign_id) {
    return NextResponse.json({ error: "lead_ids[] and campaign_id required" }, { status: 400 });
  }

  // Ensure user owns the leads
  const { data: owned, error: lerr } = await supabase
    .from("leads")
    .select("id")
    .eq("user_id", user.id)
    .in("id", lead_ids);
  if (lerr) return NextResponse.json({ error: lerr.message }, { status: 400 });
  const ownedSet = new Set((owned ?? []).map(x => x.id));
  const toAttach = lead_ids.filter((id: string) => ownedSet.has(id));

  if (toAttach.length === 0) {
    return NextResponse.json({ ok: true, attached: 0 });
  }

  const rows = toAttach.map((id: string) => ({ campaign_id, lead_id: id }));
  const { error: cerr } = await supabase
    .from("campaign_leads")
    .upsert(rows, { onConflict: "campaign_id,lead_id", ignoreDuplicates: true });
  if (cerr) return NextResponse.json({ error: cerr.message }, { status: 400 });

  return NextResponse.json({ ok: true, attached: toAttach.length });
}

