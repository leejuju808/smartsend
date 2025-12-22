import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  const parsed = limitParam ? Number.parseInt(limitParam, 10) : NaN;
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 500) : 200;

  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ campaigns: data ?? [] });
}