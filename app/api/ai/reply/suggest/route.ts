import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { replyId } = await req.json();

    if (!replyId) {
      return NextResponse.json(
        { error: "replyId is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.functions.invoke(
      "ai-reply-suggest",
      { body: { reply_id: replyId } }
    );

    if (error) {
      console.error("Error invoking ai-reply-suggest:", error);
      return NextResponse.json(
        { error: error.message || "Failed to generate suggestions" },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    console.error("Error in POST /api/ai/reply/suggest:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}







