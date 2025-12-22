// Block 20120 — Mark Conversation as Viewed
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { conversation_id } = await req.json();

    if (!conversation_id) {
      return NextResponse.json(
        { error: "conversation_id required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("inbox_threads")
      .update({
        unread_inbound_count: 0,
        last_viewed_at: new Date().toISOString(),
      })
      .eq("id", conversation_id)
      .select()
      .single();

    if (error) {
      console.error("View conversation error", error);
      return NextResponse.json(
        { error: "Failed to update view state" },
        { status: 500 }
      );
    }

    return NextResponse.json({ conversation: data }, { status: 200 });
  } catch (error: any) {
    console.error("Error in view API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

















































