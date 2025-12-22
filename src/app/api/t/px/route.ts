import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyToken } from "@/lib/tracking";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const PNG_1X1 = Uint8Array.from([
  137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,
  0,0,0,10,73,68,65,84,120,156,99,0,1,0,0,5,0,1,13,10,44,10,0,0,0,0,73,69,78,68,174,66,96,130
]);

export async function GET(req: NextRequest) {
  try {
    const m = req.nextUrl.searchParams.get("m");
    if (!m) return pixel();

    const payload = verifyToken(m);
    if (!payload) return pixel();

    const ua = req.headers.get("user-agent") ?? null;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? null;

    // Insert event
    await supabase.from("email_events").insert({
      workspace_id: payload.w,
      lead_id: payload.l,
      campaign_id: payload.c,
      event_type: "opened",
      user_agent: ua,
      ip_address: ip,
      occurred_at: new Date().toISOString()
    });

    // Update lead status if not yet Replied/Clicked
    await supabase
      .from("leads")
      .update({ status: "Opened", last_activity_at: new Date().toISOString() })
      .eq("id", payload.l)
      .neq("status", "Replied");

    return pixel();
  } catch {
    return pixel();
  }
}

function pixel() {
  return new NextResponse(PNG_1X1, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      "Content-Length": String(PNG_1X1.length)
    }
  });
}