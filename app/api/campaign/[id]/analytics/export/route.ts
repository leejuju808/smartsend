import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const days = Math.min(180, Math.max(7, Number(url.searchParams.get("days") ?? "30")));

  const { data: series, error } = await supabase.rpc("get_campaign_series", {
    p_campaign: params.id,
    p_days: days,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: Array<(string | number)[]> = [
    ["date", "sends", "replies", "bounces", "opens"],
    ...(series ?? []).map((r: any) => [
      new Date(r.d).toISOString().slice(0, 10),
      r.sends,
      r.replies,
      r.bounces,
      r.opens,
    ]),
  ];

  const csv = rows.map((r) => r.join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campaign_${params.id}_analytics_${days}d.csv"`,
      "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

