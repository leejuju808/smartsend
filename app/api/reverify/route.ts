import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const s = createClient();
  const { data, error } = await s.from("reverify_queue")
    .select("id, email, lead_id, status, attempts, created_at, last_attempt_at")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data ?? []);
}



