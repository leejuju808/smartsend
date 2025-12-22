import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

type SparkPoint = { d: string; sends: number; replies: number };

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days") ?? "14");
  const days = Math.min(60, Math.max(7, Number.isFinite(daysParam) ? daysParam : 14));
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!ids.length) {
    return NextResponse.json({ series: {} });
  }

  const results = await Promise.all(
    ids.map(async (id): Promise<[string, SparkPoint[]]> => {
      const { data, error } = await supabase.rpc("get_campaign_series_mini", {
        p_campaign: id,
        p_days: days,
      });
      if (error) return [id, []];
      return [id, data ?? []];
    }),
  );

  const series: Record<string, SparkPoint[]> = {};
  for (const [id, data] of results) {
    series[id] = data;
  }

  const res = NextResponse.json({ days, series });
  res.headers.set("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=300");
  return res;
}


