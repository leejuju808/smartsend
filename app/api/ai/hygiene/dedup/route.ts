import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Missing Supabase configuration" }, { status: 500 });
  }

  const s = createClient(url, serviceKey);
  const { data, error } = await s.rpc('ai_feedback_dedup');
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const removed = Array.isArray(data) ? data[0]?.removed ?? 0 : 0;
  return NextResponse.json({ ok: true, removed });
}
