// Block 21200 — SmartSend Roofing Price Objection Brain v1
// API Routes for Objection Handling

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id: threadId } = await params;

    if (!threadId) {
      return NextResponse.json(
        { error: "Thread ID is required" },
        { status: 400 }
      );
    }

    // Get latest objection response for this thread
    const { data: objectionResponse, error: objectionError } = await supabase
      .from("price_objection_responses")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (objectionError && objectionError.code !== "PGRST116") {
      console.error("Error fetching objection response:", objectionError);
      return NextResponse.json(
        { error: "Failed to fetch objection response" },
        { status: 500 }
      );
    }

    // Get objection detection log
    const { data: detectionLog, error: logError } = await supabase
      .from("objection_detection_log")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (logError) {
      console.error("Error fetching detection log:", logError);
    }

    return NextResponse.json({
      objection_response: objectionResponse || null,
      detection_log: detectionLog || [],
      has_objection: !!objectionResponse,
    });
  } catch (error) {
    console.error("Error in GET /api/inbox/threads/[id]/objection-handling:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id: threadId } = await params;

    if (!threadId) {
      return NextResponse.json(
        { error: "Thread ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      objection_type,
      objection_text,
      message_text,
      message_subject,
      tone = "confident",
      regenerate = false,
    } = body;

    // Call edge function to generate objection response
    const { data, error } = await supabase.functions.invoke(
      "price-objection-brain-v1",
      {
        body: {
          thread_id: threadId,
          objection_type,
          objection_text,
          message_text,
          message_subject,
          tone,
          regenerate,
        },
      }
    );

    if (error) {
      console.error("Error calling edge function:", error);
      return NextResponse.json(
        { error: "Failed to generate objection response", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in POST /api/inbox/threads/[id]/objection-handling:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id: threadId } = await params;

    if (!threadId) {
      return NextResponse.json(
        { error: "Thread ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { response_id, format_used } = body;

    if (!response_id || !format_used) {
      return NextResponse.json(
        { error: "response_id and format_used are required" },
        { status: 400 }
      );
    }

    // Mark response as used
    const { data, error } = await supabase
      .from("price_objection_responses")
      .update({
        response_used: true,
        response_format_used: format_used,
        response_used_at: new Date().toISOString(),
      })
      .eq("id", response_id)
      .eq("thread_id", threadId)
      .select()
      .single();

    if (error) {
      console.error("Error updating objection response:", error);
      return NextResponse.json(
        { error: "Failed to update objection response" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error in PATCH /api/inbox/threads/[id]/objection-handling:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
















































