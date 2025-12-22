import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const s = createClient();
  const { data, error } = await s.from("ooo_schedules")
    .select("thread_id, return_at, detected_from_event")
    .gte("return_at", new Date().toISOString())
    .order("return_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data ?? []);
}



