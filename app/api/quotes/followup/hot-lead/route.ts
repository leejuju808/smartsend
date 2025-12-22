// Block 24220 — SmartSend Quote Follow-Up Hot Lead Handler
// Handles hot lead detection for quote follow-up sequences

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { quote_id, hot_reason } = body;

    if (!quote_id) {
      return NextResponse.json(
        { error: "quote_id required" },
        { status: 400 }
      );
    }

    // Call database function to handle hot lead
    const { error } = await supabase.rpc("handle_quote_hot_lead", {
      p_quote_id: quote_id,
      p_hot_reason: hot_reason || null,
    });

    if (error) {
      console.error("Hot lead handler error:", error);
      return NextResponse.json(
        { error: "Failed to handle hot lead" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Hot lead handled successfully",
    });
  } catch (error: any) {
    console.error("Hot lead API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































