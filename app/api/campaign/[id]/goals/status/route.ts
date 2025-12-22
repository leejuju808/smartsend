import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");

  const { data, error } = await supabase.rpc("get_campaign_goal_status", {
    p_campaign: params.id,
    p_days: daysParam ? Number(daysParam) : null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: Array.isArray(data) ? data[0] ?? null : null });
}


