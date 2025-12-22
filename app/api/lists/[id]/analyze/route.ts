// Block 15600 — SmartSend List Intelligence v1
// POST /api/lists/[id]/analyze - Manually trigger list intelligence analysis

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeListIntelligence } from "@/lib/list-intelligence";

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

    // Verify list exists and belongs to workspace
    const { data: list } = await supabase
      .from("contact_lists")
      .select("id, workspace_id")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // Run intelligence analysis
    const result = await analyzeListIntelligence(params.id);

    if (!result) {
      return NextResponse.json(
        { error: "Failed to analyze list intelligence" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      intelligence: result,
    });
  } catch (err: any) {
    console.error("POST /api/lists/[id]/analyze error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}





















































