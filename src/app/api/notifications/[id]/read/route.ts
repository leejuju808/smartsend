import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";

/**
 * PATCH /api/notifications/[id]/read
 * Body: { read: boolean }
 * Marks a single notification as read/unread
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const notificationId = params.id;
    const body = await req.json();
    const { read } = body;

    if (typeof read !== "boolean") {
      return NextResponse.json(
        { error: "read must be a boolean" },
        { status: 400 }
      );
    }

    // Get current org_id
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Update notification (RLS ensures user can only update their own)
    const { data, error } = await supabase
      .from("notifications")
      .update({
        read,
        read_at: read ? new Date().toISOString() : null,
      })
      .eq("id", notificationId)
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, notification: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





























































