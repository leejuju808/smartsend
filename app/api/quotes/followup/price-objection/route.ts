// Block 24220 — SmartSend Quote Follow-Up Price Objection Handler
// Handles price objection responses for quote follow-ups

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
    const { quote_id, objection_text } = body;

    if (!quote_id || !objection_text) {
      return NextResponse.json(
        { error: "quote_id and objection_text required" },
        { status: 400 }
      );
    }

    // Call database function to handle price objection
    const { error } = await supabase.rpc("handle_quote_price_objection", {
      p_quote_id: quote_id,
      p_objection_text: objection_text,
    });

    if (error) {
      console.error("Price objection handler error:", error);
      return NextResponse.json(
        { error: "Failed to handle price objection" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Price objection handled successfully",
    });
  } catch (error: any) {
    console.error("Price objection API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































