import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Block 19700 — Get Orphaned Messages
 * Returns all messages marked as orphaned (missing campaign_id, contact_id, or thread_id)
 */
export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { data: messages, error } = await supabase
      .from("inbox_messages")
      .select("*")
      .eq("is_orphaned", true)
      .order("received_at", { ascending: false });

    if (error) {
      console.error("Error fetching orphaned messages:", error);
      return NextResponse.json(
        { error: "Failed to fetch orphaned messages" },
        { status: 500 }
      );
    }

    return NextResponse.json({ messages: messages || [] });
  } catch (error: any) {
    console.error("Error in GET /api/inbox/orphaned:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



















































