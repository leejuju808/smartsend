import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const days = Math.min(180, Math.max(7, Number(url.searchParams.get("days") ?? "30")));

  const [{ data: bench, error: e1 }, { data: ranks, error: e2 }] = await Promise.all([
    supabase.rpc("get_org_benchmarks", { p_days: days }),
    supabase.rpc("get_campaign_ranks", { p_days: days }),
  ]);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  const res = NextResponse.json({
    days,
    benchmarks: Array.isArray(bench) ? bench[0] ?? null : null,
    ranks: ranks ?? [],
  });
  res.headers.set("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=300");
  return res;
}


