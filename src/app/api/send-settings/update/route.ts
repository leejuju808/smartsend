import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { workspaceId, hourly_cap, daily_cap, jitter_ms_min, jitter_ms_max } = await req.json();
    
    if (!workspaceId) {
      throw new Error("workspaceId required");
    }
    
    if (hourly_cap <= 0 || daily_cap <= 0) {
      throw new Error("caps must be > 0");
    }
    
    if (jitter_ms_min < 0 || jitter_ms_max < jitter_ms_min) {
      throw new Error("invalid jitter");
    }

    const { error } = await supabaseAdmin.from("send_settings").upsert({
      workspace_id: workspaceId,
      hourly_cap,
      daily_cap,
      jitter_ms_min,
      jitter_ms_max,
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
  }
}
