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
          workspace_id,
          email
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

    // Apply auto-fixable fixes
    if (fix.auto_fixable) {
      if (fix.fix_type === "bounce") {
        // Throttle inbox sends
        await supabase.from("send_throttles").upsert({
          scope: "inbox",
          inbox_id: fix.inbox_id,
          max_per_day: Math.max(0, Math.floor((fix.inbox_id ? 50 : 100) * 0.5)),
          max_per_hour: 5,
          reason: "auto_throttle_bounce_fix",
        });
      }
      // Add more auto-fix logic here
    }

    // Update fix status
    const { error: updateError } = await supabase
      .from("inspector_fixes")
      .update({
        status: "applied",
        applied_at: new Date().toISOString(),
        applied_by: user.id,
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
      event_type: "inbox_inspector_fix_applied",
      description: `Applied fix: ${fix.title}`,
      metadata: {
        fix_id: fixId,
        fix_type: fix.fix_type,
        inbox_id: fix.inbox_id,
      },
    });

    return NextResponse.json({
      success: true,
      message: fix.auto_fixable
        ? "Fix applied automatically"
        : "Fix marked as applied. Please follow the instructions manually.",
    });
  } catch (error: any) {
    console.error("Error in POST /api/inspector/fixes/[id]/apply:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



