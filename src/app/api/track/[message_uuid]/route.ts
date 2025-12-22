import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const ONE_BY_ONE_GIF = Uint8Array.from([
  71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,0,0,
  44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59
]);

export async function GET(
  _req: NextRequest, 
  { params }: { params: { message_uuid: string }}
) {
  const supabase = supabaseAdmin();
  
  // Look up the message to get org_id, campaign_id, lead_id
  const { data: msg } = await supabase
    .from("send_queue")
    .select("message_uuid, org_id, campaign_id, lead_id")
    .eq("message_uuid", params.message_uuid)
    .maybeSingle();

  if (msg) {
    const ip = (_req.headers.get("x-forwarded-for") || "").split(",")[0] || "0.0.0.0";
    const ua = _req.headers.get("user-agent") || "";

    // Insert open event
    await supabase.from("open_events").insert({
      org_id: msg.org_id, 
      campaign_id: msg.campaign_id, 
      lead_id: msg.lead_id,
      message_uuid: msg.message_uuid, 
      ip, 
      ua
    });
  }

  // Return 1x1 transparent GIF
  return new NextResponse(ONE_BY_ONE_GIF, {
    headers: { 
      "Content-Type": "image/gif", 
      "Cache-Control": "no-store, must-revalidate" 
    }
  });
}

