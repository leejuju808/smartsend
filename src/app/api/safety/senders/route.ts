import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("v_sender_health")
      .select("*")
      .order("sender_email", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ success: true, senders: data || [] });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ success: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { senderId, patch } = body as { senderId: string; patch: Partial<{
      daily_cap: number; ramp_step: number; max_daily_cap: number; max_bounce_pct: number; status: string; paused_reason: string;
    }>};

    if (!senderId || !patch) {
      return NextResponse.json({ success: false, error: "senderId and patch required" }, { status: 400 });
    }

    const { error } = await supabase.from("senders").update({
      ...patch,
      updated_at: new Date().toISOString()
    }).eq("id", senderId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ success: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
