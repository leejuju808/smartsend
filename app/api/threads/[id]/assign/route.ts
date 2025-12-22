import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type AssignBody = {
  userId?: string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: user } = await supabase.auth.getUser();

    if (!user.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as AssignBody;
    const targetUserId = body.userId ?? null;

    // Get thread info
    const { data: thread, error: threadErr } = await supabase
      .from("reply_threads")
      .select("id, account_id, campaign_id, lead_id, assigned_to")
      .eq("id", params.id)
      .single();

    // Get workspace_id from campaign or lead
    let workspaceId: string | null = null;
    if (thread?.campaign_id) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("workspace_id")
        .eq("id", thread.campaign_id)
        .maybeSingle();
      workspaceId = campaign?.workspace_id || null;
    }
    if (!workspaceId && thread?.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("workspace_id")
        .eq("id", thread.lead_id)
        .maybeSingle();
      workspaceId = lead?.workspace_id || null;
    }

    if (threadErr || !thread) {
      return NextResponse.json(
        { error: threadErr?.message ?? "Not found" },
        { status: 404 }
      );
    }

    // If already assigned to same user, no-op
    if (thread.assigned_to === targetUserId) {
      return NextResponse.json({ ok: true });
    }

    // Update assignment
    const { error: updateErr } = await supabase
      .from("reply_threads")
      .update({ assigned_to: targetUserId })
      .eq("id", params.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    // Log event
    await supabase.from("activity_log").insert({
      event_type: "assigned",
      account_id: thread.account_id,
      campaign_id: thread.campaign_id,
      lead_id: thread.lead_id,
      meta: {
        thread_id: params.id,
        assigned_to: targetUserId,
        previous_assigned_to: thread.assigned_to,
      },
    });

    // Notify assigned user
    if (targetUserId && workspaceId) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/notifications/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: targetUserId,
            workspace_id: workspaceId,
            type: "thread_assigned",
            title: "New Thread Assigned",
            body: "You've been assigned a reply thread",
            link: `/replies/${params.id}`,
          }),
        }).catch((err) => {
          console.error("Failed to send assignment notification:", err);
        });
      } catch (err) {
        console.error("Error sending assignment notification:", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
