// Block 15000 — SmartSend Activity Logs v1
// GET /api/activity/contact/[id] - Contact-level activity log

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export type ContactActivityLog = {
  id: string;
  workspace_id: string;
  user_id?: string | null;
  category?: string | null;
  type: string;
  event_type?: string | null;
  event_data?: Record<string, any>;
  contact_id: string;
  campaign_id?: string | null;
  lead_id?: string | null;
  revenue_value?: number | null;
  metadata?: Record<string, any>;
  created_at: string;
  // Joined data
  user?: {
    id: string;
    email: string;
    name?: string;
  } | null;
  campaign?: {
    id: string;
    name: string;
  } | null;
};

/**
 * GET /api/activity/contact/[id]
 * Returns activity logs for a specific contact
 * Query params:
 * - category: Filter by category
 * - event_type: Filter by event type
 * - limit: number (default: 100)
 * - cursor: string (for pagination)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const { id: contactId } = await params;

    // Verify contact exists and belongs to workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id, email")
      .eq("id", contactId)
      .eq("workspace_id", workspaceId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found or access denied" },
        { status: 404 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const category = searchParams.get("category");
    const eventType = searchParams.get("event_type");
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const cursor = searchParams.get("cursor");

    // Build query
    let query = supabase
      .from("activity_logs")
      .select(`
        *,
        user:user_id (
          id,
          email,
          raw_user_meta_data
        ),
        campaign:campaign_id (
          id,
          name
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Apply filters
    if (category) {
      query = query.eq("category", category);
    }

    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    // Cursor-based pagination
    if (cursor) {
      const [cursorTime, cursorId] = cursor.split("|");
      query = query.or(
        `created_at.lt.${cursorTime},and(created_at.eq.${cursorTime},id.lt.${cursorId})`
      );
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error("[Contact Activity Logs] Query error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Transform response
    const transformed: ContactActivityLog[] = (logs || []).map((log: any) => ({
      id: log.id,
      workspace_id: log.workspace_id,
      user_id: log.user_id,
      category: log.category,
      type: log.type,
      event_type: log.event_type,
      event_data: log.event_data || {},
      contact_id: log.contact_id,
      campaign_id: log.campaign_id,
      lead_id: log.lead_id,
      revenue_value: log.revenue_value ? parseFloat(log.revenue_value) : null,
      metadata: log.metadata || {},
      created_at: log.created_at,
      user: log.user
        ? {
            id: log.user.id,
            email: log.user.email,
            name:
              log.user.raw_user_meta_data?.full_name ||
              log.user.raw_user_meta_data?.name ||
              log.user.email,
          }
        : null,
      campaign: log.campaign
        ? {
            id: log.campaign.id,
            name: log.campaign.name,
          }
        : null,
    }));

    // Generate next cursor
    const hasMore = logs && logs.length === limit;
    const nextCursor =
      hasMore && transformed.length > 0
        ? `${transformed[transformed.length - 1].created_at}|${transformed[transformed.length - 1].id}`
        : null;

    return NextResponse.json({
      data: transformed,
      pagination: {
        cursor: nextCursor,
        limit,
        hasMore: !!hasMore,
      },
    });
  } catch (error: any) {
    console.error("[Contact Activity Logs] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





















































