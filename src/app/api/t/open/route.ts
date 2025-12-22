import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaign_id = searchParams.get("c");
  const message_id = searchParams.get("m");
  
  // Always return pixel
  const pixel = Buffer.from("R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=", "base64");

  if (!campaign_id) {
    return new NextResponse(pixel, { headers: { "Content-Type": "image/gif" } });
  }

  try {
    // Get org_id from campaign if not in header
    let org_id = req.headers.get("x-org-id");
    
    if (!org_id) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("org_id")
        .eq("id", campaign_id)
        .single();
      org_id = campaign?.org_id;
    }

    if (org_id) {
      await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/functions/v1/record_event", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ campaign_id, org_id, message_id, event_type: "opened" })
      });
    }
  } catch (e) {
    // Silently fail - always return pixel
    console.error("Failed to record open event:", e);
  }

  return new NextResponse(pixel, { headers: { "Content-Type": "image/gif" } });
}

