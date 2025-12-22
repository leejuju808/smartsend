import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 500 });
  }

  const payload = (await req.json().catch(() => null)) as { threadId?: string } | null;

  if (!payload?.threadId) {
    return NextResponse.json({ error: "thread_required" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data, error } = await supabase.rpc("pick_followup_rule", {
    p_thread: payload.threadId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const match = Array.isArray(data) && data.length > 0 ? data[0] : null;

  return NextResponse.json({ match });
}






