// Block 57000 — API Route: POST /api/proposals/[id]/track
// Tracks proposal view events

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const supabase = createClient();

    const { event_type, device, ip_address, user_agent, scroll_depth_percent, time_spent_seconds, sections_viewed } = body;

    // Get client IP
    const clientIp = req.headers.get("x-forwarded-for") || 
                     req.headers.get("x-real-ip") || 
                     ip_address || 
                     "unknown";

    // Call edge function to track view
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/proposal-view`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          proposal_id: id,
          device: device || (req.headers.get("user-agent")?.includes("Mobile") ? "mobile" : "desktop"),
          ip_address: clientIp,
          user_agent: user_agent || req.headers.get("user-agent"),
          scroll_depth_percent,
          time_spent_seconds,
          sections_viewed,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Error tracking view:", error);
      return NextResponse.json(
        { error: "Failed to track view" },
        { status: 500 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in /api/proposals/[id]/track:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
