// app/api/t/c/[token]/route.ts
// Click tracking redirect endpoint

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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
      .eq("type", "click")
      .single();

    if (!link) {
      // Fallback redirect if link not found
      return NextResponse.redirect(
        process.env.NEXT_PUBLIC_APP_URL || "https://smartsendhq.com",
        { status: 302 }
      );
    }

    const today = new Date().toISOString().slice(0, 10);

    // Record click event (fire and forget)
    supabase.from("smartsend_click_events").insert({
      link_id: link.id,
      campaign_id: link.campaign_id,
      lead_id: link.lead_id
    }).catch((err) => {
      console.error("Failed to record click event:", err);
    });

    // Update stats (fire and forget)
    supabase.rpc("smartsend_increment_stat", {
      p_campaign_id: link.campaign_id,
      p_date: today,
      p_field: "clicks"
    }).catch((err) => {
      console.error("Failed to increment click stat:", err);
    });

    // Redirect to the original URL
    return NextResponse.redirect(link.url, { status: 302 });
  } catch (error) {
    console.error("Error processing click tracking:", error);
    // Fallback redirect on error
    return NextResponse.redirect(
      process.env.NEXT_PUBLIC_APP_URL || "https://smartsendhq.com",
      { status: 302 }
    );
  }
}

