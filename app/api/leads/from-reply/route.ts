// app/api/leads/from-reply/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  try {
    const { replyId } = (await req.json()) as { replyId?: string };

    if (!replyId) {
      return NextResponse.json(
        { error: "Missing replyId" },
        { status: 400 }
      );
    }

    // Call RPC to create the lead
    const { data, error } = await supabase.rpc("create_lead_from_reply", {
      p_reply_id: replyId,
    });

    if (error) {
      console.error("create_lead_from_reply error:", error);
      return NextResponse.json(
        {
          error: "Failed to create lead",
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        leadId: data, // uuid of new lead
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("POST /api/leads/from-reply error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}


























































