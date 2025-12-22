import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";

export type Notification = {
  id: string;
  type: 'reply' | 'hot_lead' | 'warm_lead' | 'task_due' | 'system';
  title: string;
  body?: string;
  contactId?: string;
  replyThreadId?: string;
  taskId?: string;
  campaignId?: string;
  url?: string;
  read: boolean;
  createdAt: string;
};

/**
 * GET /api/notifications
 * Query params:
 * - status: 'unread' | 'all' (default: 'unread')
 * - limit: number (default: 20)
 * - cursor: string (for pagination)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status") || "unread";
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const cursor = searchParams.get("cursor");

    // Get current org_id
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Build query
    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Filter by read status
    if (status === "unread") {
      query = query.eq("read", false);
    }

    // Cursor-based pagination
    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data: notifications, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform to API format
    const transformed: Notification[] = (notifications || []).map((n: any) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body || undefined,
      contactId: n.contact_id || undefined,
      replyThreadId: n.reply_thread_id || undefined,
      taskId: n.task_id || undefined,
      campaignId: n.campaign_id || undefined,
      url: n.url || undefined,
      read: n.read,
      createdAt: n.created_at,
    }));

    // Determine if there are more results
    const hasMore = notifications && notifications.length === limit;

    return NextResponse.json({
      data: transformed,
      pagination: {
        cursor: hasMore && transformed.length > 0 
          ? transformed[transformed.length - 1].createdAt 
          : null,
        limit,
        hasMore: !!hasMore,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
