import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const PAGE_SIZE = 25;

export async function GET(req: NextRequest, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const types = url.searchParams.getAll("type");

  let query = supabase
    .from("campaign_events")
    .select("id,created_at,type,actor_user_id,target_user_id,invite_id,meta")
    .eq("campaign_id", params.campaignId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (before) {
    query = query.lt("created_at", before);
  }
  if (types.length) {
    query = query.in("type", types);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = data ?? [];
  const nextCursor = items.length > PAGE_SIZE ? items[PAGE_SIZE - 1].created_at : null;
  const page = items.slice(0, PAGE_SIZE);

  return NextResponse.json({ events: page, nextCursor });
}

