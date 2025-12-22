import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const revalidate = 60; // cache 60s for stability

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || 10);
  const window = (searchParams.get("window") || "7d").toLowerCase();
  
  const supabase = getSupabaseServer();
  
  // Use the trending view
  const { data, error } = await supabase
    .from("v_template_trending_7d")
    .select("template_id, name, cover_url, is_paid, price_cents, kind, views_7d, installs_7d, copies_7d, exports_7d, trend_score")
    .order("trend_score", { ascending: false })
    .limit(limit);
    
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  return NextResponse.json({ items: data || [] });
} 