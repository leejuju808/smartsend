import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("processed_events")
    .select("event_id, processed_at")
    .order("processed_at", { ascending: false })
    .limit(1);
  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });
  return NextResponse.json({ last: data?.[0] ?? null });
}