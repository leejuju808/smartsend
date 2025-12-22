import { NextRequest, NextResponse } from "next/server";
import { verify, OpenPayload } from "@/lib/tracking/token";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// 1x1 transparent GIF bytes
const GIF = Uint8Array.from([71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,1,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const t = searchParams.get("t");
  
  try {
    const p = t ? verify<OpenPayload>(t) : null;
    if (p?.email_log_id) {
      const supabase = createRouteHandlerClient({ cookies });
      
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0] || null;
      const ua = req.headers.get("user-agent") || null;
      
      // Fetch email_log to get campaign_id and lead_id
      const { data: logData } = await supabase
        .from("email_logs")
        .select("campaign_id, lead_id, message_id, opened")
        .eq("id", p.email_log_id)
        .single();
      
      // Only track if not already opened (basic dedupe)
      if (!logData?.opened) {
        // Insert open event with enriched data
        await supabase.from("email_events").insert({
          email_log_id: p.email_log_id,
          event_type: "open",
          campaign_id: logData?.campaign_id || null,
          lead_id: logData?.lead_id || null,
          message_id: logData?.message_id || null,
          ip,
          ua: ua
        });
        
        // Update email_logs to mark as opened and set timestamp
        await supabase
          .from("email_logs")
          .update({ opened: true, opened_at: new Date().toISOString() })
          .eq("id", p.email_log_id);
      }
    }
  } catch (error) {
    // Never block the pixel - fail silently
    console.error("Error tracking email open:", error);
  }
  
  return new NextResponse(GIF, {
    headers: { 
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, max-age=0" 
    }
  });
} 