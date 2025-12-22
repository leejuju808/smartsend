import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/laws/adjustMessaging
 * 
 * Adjusts messaging based on state-specific laws and restrictions.
 * Used by SmartSend to ensure compliance in all messaging.
 */
export async function POST(req: NextRequest) {
  try {
    const { message, state_code, workspace_id } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    if (!state_code || typeof state_code !== "string") {
      return NextResponse.json(
        { error: "state_code is required (2-letter code)" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Call the edge function via Supabase client
    const { data, error } = await supabase.functions.invoke("laws-adjust-messaging", {
      body: {
        message,
        state_code: state_code.toUpperCase(),
        workspace_id,
      },
    });

    if (error) {
      console.error("[State Laws API] Error adjusting messaging:", error);
      return NextResponse.json(
        { error: "Failed to adjust messaging", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error: any) {
    console.error("[State Laws API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}





















































