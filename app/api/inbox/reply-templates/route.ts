// app/api/inbox/reply-templates/route.ts
// Block 20100 — Get Inbox Reply Templates

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const account_id = searchParams.get("account_id"); // Legacy support

    // Get workspace_id from user if not provided
    let finalWorkspaceId = workspace_id;

    if (!finalWorkspaceId && account_id) {
      // Legacy: account_id might be workspace_id
      finalWorkspaceId = account_id;
    }

    if (!finalWorkspaceId) {
      // Try to get workspace_id from user's workspace membership
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (membership) {
        finalWorkspaceId = membership.workspace_id;
      }
    }

    if (!finalWorkspaceId) {
      return NextResponse.json(
        { error: "workspace_id or account_id required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("inbox_reply_templates")
      .select("*")
      .eq("workspace_id", finalWorkspaceId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Templates fetch error", error);
      return NextResponse.json(
        { error: "Failed to load templates" },
        { status: 500 }
      );
    }

    return NextResponse.json({ templates: data || [] });
  } catch (error: any) {
    console.error("Error in /api/inbox/reply-templates:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

















































