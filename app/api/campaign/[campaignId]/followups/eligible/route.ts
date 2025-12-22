import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { assertViewer } from "@/lib/acl";

export async function GET(req: NextRequest, { params }: { params: { campaignId: string } }) {
  try {
    await assertViewer(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 200);

  const { data, error } = await supabase
    .from("v_followup_eligible")
    .select("*")
    .eq("campaign_id", params.campaignId)
    .order("since_inbound", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}



