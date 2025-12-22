// app/api/t/o/[token]/route.ts
// Open tracking pixel endpoint

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side only
);

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64"
);

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token;

    const { data: link } = await supabase
      .from("smartsend_links")
      .select("*")
      .eq("token", token)
      .eq("type", "open")
      .single();

    if (link) {
      const today = new Date().toISOString().slice(0, 10);

      // Record open event (fire and forget)
      supabase.from("smartsend_open_events").insert({
        link_id: link.id,
        campaign_id: link.campaign_id,
        lead_id: link.lead_id
      }).catch((err) => {
        console.error("Failed to record open event:", err);
      });

      // Update stats (fire and forget)
      supabase.rpc("smartsend_increment_stat", {
        p_campaign_id: link.campaign_id,
        p_date: today,
        p_field: "opens"
      }).catch((err) => {
        console.error("Failed to increment open stat:", err);
      });
    }
  } catch (error) {
    // Swallow errors to avoid surfacing pixel issues
    console.error("Error processing open tracking:", error);
  }

  // Always return pixel, even if tracking fails
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": PIXEL.length.toString(),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
    }
  });
}

