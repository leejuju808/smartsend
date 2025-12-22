import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const campaignId = params.id;
  if (!campaignId) {
    return NextResponse.json({ ok: false, error: "campaign_required" }, { status: 400 });
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);

  const { data, error } = await supabase
    .from("leads")
    .select("id,first_name,company,email")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, items: data ?? [] });
}


