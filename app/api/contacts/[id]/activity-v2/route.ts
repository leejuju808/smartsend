// Block 16600 — SmartSend Activity Log v2
// GET /api/contacts/[id]/activity-v2
// Contact-level activity feed (all logs for a specific contact)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

    // Get current workspace
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Verify contact exists and belongs to workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id, email, first_name, last_name")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found or access denied" },
        { status: 404 }
      );
    }

    // Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50", 10));
    const category = searchParams.get("category");
    const type = searchParams.get("type");
    const severity = searchParams.get("severity");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    // Build query
    let query = supabase
      .from("activity_logs_v2")
      .select(`
        *,
        user:user_id (
          id,
          email,
          raw_user_meta_data
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(limit + 1); // Get one extra to check if there's more

    // Apply filters
    if (category) {
      query = query.eq("category", category);
    }
    
    if (type) {
      query = query.eq("type", type);
    }
    
    if (severity) {
      query = query.eq("severity", severity);
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
      console.error("Error fetching contact activity logs:", error);
      return NextResponse.json(
        { error: "Failed to fetch activity logs" },
        { status: 500 }
      );
    }

    // Check if there's more data
    const hasMore = logs && logs.length > limit;
    const results = hasMore ? logs.slice(0, limit) : logs || [];

    // Generate next cursor
    let nextCursor: string | null = null;
    if (hasMore && results.length > 0) {
      const lastItem = results[results.length - 1];
      nextCursor = `${lastItem.created_at}|${lastItem.id}`;
    }

    return NextResponse.json({
      contact: {
        id: contact.id,
        email: contact.email,
        name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.email,
      },
      logs: results,
      pagination: {
        hasMore,
        nextCursor,
        limit,
      },
    });
  } catch (error) {
    console.error("Error in contact activity-v2 route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





















































