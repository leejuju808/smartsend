import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const ORDER_BY_FIELDS = new Set(["minutes_open", "last_inbound_at"]);
const DIR_VALUES = new Set(["asc", "desc"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);

  const campaignId = url.searchParams.get("campaignId");
  const limit = clampNumber(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampNumber(url.searchParams.get("offset"), 0, 0, 5000);
  const orderBy = ORDER_BY_FIELDS.has(url.searchParams.get("orderBy") ?? "") ? url.searchParams.get("orderBy")! : "minutes_open";
  const dir = DIR_VALUES.has(url.searchParams.get("dir") ?? "") ? url.searchParams.get("dir")! : "desc";

  const { data, error } = await supabase.rpc("list_threads_needing_reply", {
    p_campaign: campaignId,
    p_limit: limit,
    p_offset: offset,
    p_order_by: orderBy,
    p_dir: dir,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = Array.isArray(data) ? data : [];
  const nextOffset = items.length < limit ? null : offset + limit;

  return NextResponse.json({
    items,
    nextOffset,
  });
}

function clampNumber(raw: string | null, fallback: number, min: number, max: number) {
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}



