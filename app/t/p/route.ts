import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 1x1 transparent GIF
const GIF_BYTES = Uint8Array.from([
  71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,1,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59
]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
  }
);

export async function GET(req: NextRequest) {
  try {
    const logId = req.nextUrl.searchParams.get("l"); // campaign_logs.id (uuid)

    if (logId) {
      const now = new Date().toISOString();
      // write event
      await supabase.from("campaign_events").insert({
        log_id: logId,
        event_type: "opened",
        created_at: now,
      });
      // bump counters atomically
      await supabase.rpc("bump_open", { p_log_id: logId, p_now: now });
    }

    return new NextResponse(GIF_BYTES, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch {
    return new NextResponse(GIF_BYTES, { headers: { "Content-Type": "image/gif" } });
  }
}