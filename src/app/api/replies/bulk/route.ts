// Block 9400 — Bulk Actions Engine
// POST /api/replies/bulk - Bulk update reply threads

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type BulkAction =
  | { type: "archive" }
  | { type: "mark_read" }
  | { type: "mark_unread" }
  | { type: "assign_owner"; ownerId: string }
  | { type: "intent"; value: "hot" | "warm" | "follow_up" | "not_interested" };

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace via workspace_members
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", u.user.id);

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ ok: false, error: "No workspace found" }, { status: 400 });
  }

  const workspaceIds = memberships.map((m) => m.workspace_id);

  const body = await req.json().catch(() => ({}));
  const { threadIds, action }: { threadIds: string[]; action: BulkAction } = body;

  if (!Array.isArray(threadIds) || threadIds.length === 0) {
    return NextResponse.json({ ok: false, error: "threadIds array required" }, { status: 400 });
  }

  if (!action || !action.type) {
    return NextResponse.json({ ok: false, error: "action required" }, { status: 400 });
  }

  // Verify all replies belong to user's campaigns (RLS check)
  // Check campaign_replies via campaigns -> workspace_members
  const { data: replies, error: verifyError } = await supabase
    .from("campaign_replies")
    .select("id, campaign_id, campaigns!inner(workspace_id)")
    .in("id", threadIds);

  if (verifyError) {
    return NextResponse.json({ ok: false, error: verifyError.message }, { status: 500 });
  }

  // Filter to only replies in user's workspaces
  const validReplyIds =
    replies
      ?.filter((r: any) => workspaceIds.includes(r.campaigns?.workspace_id))
      .map((r: any) => r.id) || [];

  if (validReplyIds.length !== threadIds.length) {
    return NextResponse.json(
      { ok: false, error: "Some replies not found or unauthorized" },
      { status: 403 }
    );
  }

  try {
    switch (action.type) {
      case "archive": {
        // Mark replies as handled (archived)
        const { error } = await supabase
          .from("campaign_replies")
          .update({
            handled_at: new Date().toISOString(),
            handled_by_user_id: u.user.id,
            updated_at: new Date().toISOString(),
          })
          .in("id", validReplyIds)
          .is("handled_at", null);

        if (error) {
          return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }
        break;
      }

      case "mark_read": {
        // Mark replies as handled (read)
        const { error } = await supabase
          .from("campaign_replies")
          .update({
            handled_at: new Date().toISOString(),
            handled_by_user_id: u.user.id,
            updated_at: new Date().toISOString(),
          })
          .in("id", validReplyIds)
          .is("handled_at", null);

        if (error) {
          return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }
        break;
      }

      case "mark_unread": {
        // Mark replies as unhandled (unread)
        const { error } = await supabase
          .from("campaign_replies")
          .update({
            handled_at: null,
            handled_by_user_id: null,
            updated_at: new Date().toISOString(),
          })
          .in("id", validReplyIds);

        if (error) {
          return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }
        break;
      }

      case "assign_owner": {
        // Assign owner to leads associated with these replies
        const { data: replyData } = await supabase
          .from("campaign_replies")
          .select("lead_id")
          .in("id", validReplyIds);

        const leadIds = Array.from(new Set(replyData?.map((r: any) => r.lead_id).filter(Boolean) || []));

        if (leadIds.length > 0) {
          const { error } = await supabase
            .from("leads")
            .update({ owner_id: action.ownerId, updated_at: new Date().toISOString() })
            .in("id", leadIds);

          if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
          }
        }
        break;
      }

      case "intent": {
        // Update intent on campaign_replies
        const { error } = await supabase
          .from("campaign_replies")
          .update({
            intent: action.value,
            updated_at: new Date().toISOString(),
          })
          .in("id", validReplyIds);

        if (error) {
          return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }
        break;
      }

      default:
        return NextResponse.json({ ok: false, error: "Invalid action type" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, updated: validReplyIds.length });
  } catch (error: any) {
    console.error("Bulk action error:", error);
    return NextResponse.json({ ok: false, error: error.message || "Unknown error" }, { status: 500 });
  }
}
