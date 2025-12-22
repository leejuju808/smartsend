import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fixId = params.id;

    // Get fix details
    const { data: fix, error: fixError } = await supabase
      .from("inspector_fixes")
      .select(`
        *,
        sender_inboxes!inner(
          id,
          workspace_id
        )
      `)
      .eq("id", fixId)
      .single();

    if (fixError || !fix) {
      return NextResponse.json(
        { error: "Fix not found" },
        { status: 404 }
      );
    }

    // Verify workspace access
    const { data: ws, error: wsError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", fix.sender_inboxes.workspace_id)
      .single();

    if (wsError || !ws) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Update fix status
    const { error: updateError } = await supabase
      .from("inspector_fixes")
      .update({
        status: "dismissed",
        dismissed_at: new Date().toISOString(),
        dismissed_by: user.id,
      })
      .eq("id", fixId);

    if (updateError) {
      console.error("Error updating fix:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    // Log activity
    await supabase.from("workspace_activity").insert({
      workspace_id: fix.sender_inboxes.workspace_id,
      actor_id: user.id,
      event_type: "inbox_inspector_fix_dismissed",
      description: `Dismissed fix: ${fix.title}`,
      metadata: {
        fix_id: fixId,
        fix_type: fix.fix_type,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Fix dismissed",
    });
  } catch (error: any) {
    console.error("Error in POST /api/inspector/fixes/[id]/dismiss:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



