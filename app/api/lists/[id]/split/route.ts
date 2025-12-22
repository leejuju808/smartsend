// Block 12900 — SmartSend List Builder Tools v1
// POST /api/lists/[id]/split - Split a list by size, tag, or status

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
    const { type, chunk_size, tag } = body as {
      type: "size" | "tag" | "status";
      chunk_size?: number;
      tag?: string;
    };

    if (!type || !["size", "tag", "status"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid split type. Must be 'size', 'tag', or 'status'" },
        { status: 400 }
      );
    }

    let result;
    if (type === "size") {
      if (!chunk_size || chunk_size < 1) {
        return NextResponse.json(
          { error: "chunk_size is required and must be >= 1" },
          { status: 400 }
        );
      }
      const { data, error } = await supabase.rpc("split_list_by_size", {
        p_list_id: params.id,
        p_chunk_size: chunk_size,
        p_workspace_id: workspaceId,
      });
      if (error) throw error;
      result = data;
    } else if (type === "tag") {
      if (!tag) {
        return NextResponse.json(
          { error: "tag is required for tag split" },
          { status: 400 }
        );
      }
      const { data, error } = await supabase.rpc("split_list_by_tag", {
        p_list_id: params.id,
        p_tag: tag,
        p_workspace_id: workspaceId,
      });
      if (error) throw error;
      result = data;
    } else if (type === "status") {
      const { data, error } = await supabase.rpc("split_list_by_status", {
        p_list_id: params.id,
        p_workspace_id: workspaceId,
      });
      if (error) throw error;
      result = data;
    }

    return NextResponse.json({
      success: true,
      new_lists: result || [],
    });
  } catch (err: any) {
    console.error("POST /api/lists/[id]/split error:", err);
    return NextResponse.json(
      {
        error: "Failed to split list",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}





















































