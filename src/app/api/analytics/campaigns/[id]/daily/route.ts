import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { from, to } = await req.json(); // optional date filters

  let query = supabase
    .from("campaign_stats_daily")
    .select("*")
    .eq("campaign_id", params.id)
    .order("day", { ascending: true });

  if (from) query = query.gte("day", from);
  if (to) query = query.lte("day", to);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ points: data || [] }, { status: 200 });
}







