import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId } = await req.json();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      // Try team_members as fallback
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("workspace_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!teamMember) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Fetch chart data using RPC functions
    const { data: sends, error: sendsError } = await supabase.rpc(
      "chart_sends_7d",
      {
        workspace_input: workspaceId,
      }
    );

    const { data: replies, error: repliesError } = await supabase.rpc(
      "chart_replies_7d",
      {
        workspace_input: workspaceId,
      }
    );

    if (sendsError) {
      return NextResponse.json(
        { error: sendsError.message },
        { status: 400 }
      );
    }

    if (repliesError) {
      return NextResponse.json(
        { error: repliesError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      sends: sends || [],
      replies: replies || [],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}








