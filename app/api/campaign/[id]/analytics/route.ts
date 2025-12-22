import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const days = Math.min(180, Math.max(7, Number(url.searchParams.get("days") ?? "30")));

  const [{ data: kpis, error: e1 }, { data: series, error: e2 }] = await Promise.all([
    supabase.rpc("get_campaign_kpis", { p_campaign: params.id, p_days: days }),
    supabase.rpc("get_campaign_series", { p_campaign: params.id, p_days: days }),
  ]);

  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500 });
  }
  if (e2) {
    return NextResponse.json({ error: e2.message }, { status: 500 });
  }

  const k =
    Array.isArray(kpis) && kpis[0]
      ? kpis[0]
      : { sends: 0, replies: 0, reply_rate: 0, bounces: 0, bounce_rate: 0, opens: 0, open_rate: 0 };

  const res = NextResponse.json({ days, kpis: k, series: series ?? [] });
  res.headers.set("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=300");
  return res;
}


