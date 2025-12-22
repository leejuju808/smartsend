import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const days = Math.min(180, Math.max(7, Number(url.searchParams.get("days") ?? "7")));

  const [{ data: kpis, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
    supabase.rpc("get_overview_kpis", { p_days: days }),
    supabase.rpc("get_overview_campaigns", { p_days: days }),
  ]);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  const k = Array.isArray(kpis) && kpis[0]
    ? kpis[0]
    : {
        sends: 0,
        replies: 0,
        reply_rate: 0,
        opens: 0,
        bounces: 0,
        send_delta: 0,
        reply_delta: 0,
        open_delta: 0,
        bounce_delta: 0,
        reply_rate_delta: 0,
      };

  const res = NextResponse.json({ days, kpis: k, campaigns: rows ?? [] });
  res.headers.set("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=300");
  return res;
}

