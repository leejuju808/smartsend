// Block 13100 — Direct Call Log + Phone Activity Tracking v1
// GET /api/call-log/list
// Get all call logs for the current organization

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";

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
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const contactId = searchParams.get("contactId");
    const direction = searchParams.get("direction") as "inbound" | "outbound" | null;
    const outcome = searchParams.get("outcome");

    // Build query
    let query = supabase
      .from("call_logs")
      .select(`
        *,
        contact:contact_id (
          id,
          email,
          first_name,
          last_name,
          phone
        ),
        user:user_id (
          id,
          email,
          raw_user_meta_data
        )
      `)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (contactId) {
      query = query.eq("contact_id", contactId);
    }
    if (direction) {
      query = query.eq("direction", direction);
    }
    if (outcome) {
      query = query.eq("outcome", outcome);
    }

    const { data: callLogs, error: callLogsError } = await query;

    if (callLogsError) {
      console.error("[Call Log] Fetch error:", callLogsError);
      return NextResponse.json(
        { error: "Failed to fetch call logs", details: callLogsError.message },
        { status: 500 }
      );
    }

    // Format response
    const formattedLogs = callLogs?.map((log: any) => ({
      ...log,
      contact: log.contact ? {
        id: log.contact.id,
        email: log.contact.email,
        name: [log.contact.first_name, log.contact.last_name].filter(Boolean).join(" ") || log.contact.email,
        phone: log.contact.phone,
      } : null,
      user: log.user ? {
        id: log.user.id,
        email: log.user.email,
        name: log.user.raw_user_meta_data?.full_name || log.user.email,
      } : null,
    })) || [];

    // Get total count for pagination
    let countQuery = supabase
      .from("call_logs")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId);

    if (contactId) {
      countQuery = countQuery.eq("contact_id", contactId);
    }
    if (direction) {
      countQuery = countQuery.eq("direction", direction);
    }
    if (outcome) {
      countQuery = countQuery.eq("outcome", outcome);
    }

    const { count } = await countQuery;

    return NextResponse.json({
      success: true,
      callLogs: formattedLogs,
      pagination: {
        limit,
        offset,
        total: count || 0,
      },
    });
  } catch (error) {
    console.error("[Call Log] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



























































