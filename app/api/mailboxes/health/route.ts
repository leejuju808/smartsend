import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const sb = createClient();
  const { data } = await sb.from("mailboxes")
    .select("id,email,provider,send_quota_per_day,send_quota_used,quota_reset_at,enabled,expires_at")
    .order("created_at", { ascending: true });
  return NextResponse.json({ data, now: new Date().toISOString() });
}















