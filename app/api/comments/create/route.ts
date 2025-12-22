import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { lead_id, thread_id, campaign_id, body, mentions } = await req.json();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Validate that at least one context is provided
    if (!lead_id && !thread_id && !campaign_id) {
      return NextResponse.json(
        { error: "Must provide lead_id, thread_id, or campaign_id" },
        { status: 400 }
      );
    }

    // Insert comment
    const { data: comment, error: commentError } = await supabase
      .from("comments")
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        lead_id: lead_id || null,
        thread_id: thread_id || null,
        campaign_id: campaign_id || null,
        body,
        mentions: mentions || [],
      })
      .select()
      .single();

    if (commentError) {
      return NextResponse.json({ error: commentError.message }, { status: 400 });
    }

    // Log activity (don't await - fire and forget)
    supabase.from("activity_feed").insert({
      workspace_id: workspaceId,
      type: "comment_added",
      metadata: { lead_id, thread_id, campaign_id, comment_id: comment.id },
      created_by: user.id,
    }).then(() => {}).catch(() => {});

    return NextResponse.json({ ok: true, comment });
  } catch (error: any) {
    console.error("Error creating comment:", error);
    return NextResponse.json({ error: error.message || "Failed to create comment" }, { status: 500 });
  }
}

