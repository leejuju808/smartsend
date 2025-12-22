// Block 15000 — SmartSend Activity Logs v1
// GET /api/activity - Master activity log with filters
// POST /api/activity/create - Create activity log entry

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export type ActivityLog = {
  id: string;
  workspace_id: string;
  user_id?: string | null;
  category?: string | null;
  type: string;
  event_type?: string | null;
  event_data?: Record<string, any>;
  contact_id?: string | null;
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
  contact?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  } | null;
  campaign?: {
    id: string;
    name: string;
  } | null;
};

/**
 * GET /api/activity
 * Query params:
 * - category: Filter by category (sending, inbox, contact, campaign, task, pipeline, scheduler, deliverability, team, billing)
 * - event_type: Filter by specific event type
 * - contact_id: Filter by contact
 * - campaign_id: Filter by campaign
 * - user_id: Filter by user/team member
 * - date_from: ISO date string
 * - date_to: ISO date string
 * - limit: number (default: 100)
 * - cursor: string (for pagination)
 */
export async function GET(req: NextRequest) {
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

    const searchParams = req.nextUrl.searchParams;
    const category = searchParams.get("category");
    const eventType = searchParams.get("event_type");
    const contactId = searchParams.get("contact_id");
    const campaignId = searchParams.get("campaign_id");
    const userId = searchParams.get("user_id");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
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
        contact:contact_id (
          id,
          email,
          first_name,
          last_name
        ),
        campaign:campaign_id (
          id,
          name
        )
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Apply filters
    if (category) {
      query = query.eq("category", category);
    }

    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    if (contactId) {
      query = query.eq("contact_id", contactId);
    }

    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }

    if (userId) {
      query = query.eq("user_id", userId);
    }

    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }

    if (dateTo) {
      query = query.lte("created_at", dateTo);
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
      console.error("[Activity Logs] Query error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Transform response
    const transformed: ActivityLog[] = (logs || []).map((log: any) => ({
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
      contact: log.contact
        ? {
            id: log.contact.id,
            email: log.contact.email,
            first_name: log.contact.first_name,
            last_name: log.contact.last_name,
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
    console.error("[Activity Logs] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/activity/create
 * Body: {
 *   category: string (required)
 *   type: string (required)
 *   event_type?: string
 *   event_data?: Record<string, any>
 *   contact_id?: string
 *   campaign_id?: string
 *   lead_id?: string
 *   revenue_value?: number
 *   metadata?: Record<string, any>
 * }
 */
export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const {
      category,
      type,
      event_type,
      event_data,
      contact_id,
      campaign_id,
      lead_id,
      revenue_value,
      metadata,
    } = body;

    // Validate required fields
    if (!category || !type) {
      return NextResponse.json(
        { error: "Missing required fields: category, type" },
        { status: 400 }
      );
    }

    // Insert activity log
    const { data: log, error } = await supabase
      .from("activity_logs")
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        category,
        type,
        event_type: event_type || null,
        event_data: event_data || {},
        contact_id: contact_id || null,
        campaign_id: campaign_id || null,
        lead_id: lead_id || null,
        revenue_value: revenue_value || null,
        metadata: metadata || {},
      })
      .select("*")
      .single();

    if (error) {
      console.error("[Activity Logs] Insert error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: log }, { status: 201 });
  } catch (error: any) {
    console.error("[Activity Logs] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
