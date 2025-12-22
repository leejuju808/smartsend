import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";

/**
 * POST /api/notifications/mark-all-read
 * Marks all user's notifications as read
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current org_id
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Mark all unread notifications as read
    const { data, error } = await supabase
      .from("notifications")
      .update({
        read: true,
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .eq("is_read", false)
      .or("read.is.false")
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      updated: data?.length || 0,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



