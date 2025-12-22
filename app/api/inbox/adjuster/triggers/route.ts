import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * GET /api/inbox/adjuster/triggers?thread_id=xxx
 * Detects triggers for adjuster email generation
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("thread_id");

    if (!threadId) {
      return NextResponse.json(
        { error: "thread_id is required" },
        { status: 400 }
      );
    }

    // Call database function to detect triggers
    const { data, error } = await supabase.rpc(
      "detect_adjuster_email_triggers",
      {
        p_thread_id: threadId,
      }
    );

    if (error) {
      console.error("Error detecting triggers:", error);
      return NextResponse.json(
        { error: error.message || "Failed to detect triggers" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[Adjuster Triggers] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
















































