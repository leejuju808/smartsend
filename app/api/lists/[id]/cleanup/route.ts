// Block 12900 — SmartSend List Builder Tools v1
// POST /api/lists/[id]/cleanup - Clean up a list (remove duplicates, suppressed, bounces)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const workspaceId = membership?.workspace_id;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      remove_duplicates = true,
      remove_suppressed = true,
      remove_bounces = true,
    } = body as {
      remove_duplicates?: boolean;
      remove_suppressed?: boolean;
      remove_bounces?: boolean;
    };

    const { data: result, error } = await supabase.rpc("clean_list", {
      p_list_id: params.id,
      p_workspace_id: workspaceId,
      p_remove_duplicates: remove_duplicates,
      p_remove_suppressed: remove_suppressed,
      p_remove_bounces: remove_bounces,
    });

    if (error) {
      console.error("Error cleaning list:", error);
      return NextResponse.json(
        { error: "Failed to clean list", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error("POST /api/lists/[id]/cleanup error:", err);
    return NextResponse.json(
      {
        error: "Failed to clean list",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}





















































