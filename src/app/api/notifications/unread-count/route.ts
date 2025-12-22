import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";

/**
 * GET /api/notifications/unread-count
 * Returns the count of unread notifications for the current user
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current org_id
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ count: 0 });
    }

    // Count unread notifications
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .eq("is_read", false)
      .eq("is_archived", false)
      .or("read.is.false");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ count: count || 0 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



