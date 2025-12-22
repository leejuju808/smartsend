import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  if (!params.id) {
    return NextResponse.json({ ok: false, error: "campaign_required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("v_nudge_variant_stats")
    .select("*")
    .eq("campaign_id", params.id)
    .order("good_rate_pct", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, items: data ?? [] });
}

