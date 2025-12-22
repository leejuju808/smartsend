import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

type SortKey =
  | "campaign_name"
  | "sends"
  | "replies"
  | "reply_rate"
  | "opens"
  | "bounces"
  | "send_delta"
  | "reply_delta"
  | "reply_rate_delta"
  | "last_activity";

const VALID: SortKey[] = [
  "campaign_name",
  "sends",
  "replies",
  "reply_rate",
  "opens",
  "bounces",
  "send_delta",
  "reply_delta",
  "reply_rate_delta",
  "last_activity",
];

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);

  const days = Math.min(180, Math.max(7, Number(url.searchParams.get("days") ?? "7")));
  const sort = (url.searchParams.get("sort") as SortKey) || "reply_rate";
  const dir = (url.searchParams.get("dir") || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "25")));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));

  if (!VALID.includes(sort)) {
    return NextResponse.json({ error: "invalid sort key" }, { status: 400 });
  }

  // Always fetch ascending to keep the SQL RPC simple; reverse client-side if needed.
  const needsAsc = dir === "asc";

  const { data, error } = await supabase.rpc("get_overview_campaigns_page", {
    p_days: days,
    p_sort: sort,
    p_dir: "asc",
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows = data ?? [];
  if (!needsAsc) {
    rows = [...rows].sort((a: any, b: any) => {
      const va = a?.[sort] ?? 0;
      const vb = b?.[sort] ?? 0;
      if (va === vb) return 0;
      return va < vb ? 1 : -1;
    });
  }

  const total = rows[0]?.total ?? 0;
  const res = NextResponse.json({ days, total, limit, offset, sort, dir, rows });
  res.headers.set("Cache-Control", "public, max-age=30, s-maxage=30, stale-while-revalidate=180");
  return res;
}

