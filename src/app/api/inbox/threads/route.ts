// GET /api/inbox/threads
// List inbox threads with filters and pagination

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const { searchParams } = new URL(req.url);

  const filter = searchParams.get("filter") || "all"; // all, urgent, booking_request, price_question, etc.
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");
  const search = searchParams.get("search") || "";

  try {
    let query = supabaseAdmin
      .from("inbox_threads")
      .select(
        `
        id,
        lead_id,
        last_message,
        summary,
        last_intent,
        urgency,
        status,
        unread_count,
        updated_at,
        created_at,
        leads:lead_id (
          id,
          first_name,
          last_name,
          name,
          email,
          phone,
          status
        )
        `
      )
      .eq("workspace_id", workspace_id)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (filter === "urgent") {
      query = query.eq("urgency", "urgent");
    } else if (filter === "unread") {
      query = query.gt("unread_count", 0);
    } else if (filter !== "all") {
      query = query.eq("last_intent", filter);
    }

    // Apply search
    if (search) {
      query = query.or(
        `last_message.ilike.%${search}%,summary.ilike.%${search}%`
      );
    }

    const { data: threads, error } = await query;

    if (error) {
      console.error("Error fetching threads:", error);
      return NextResponse.json(
        { error: "Failed to fetch threads" },
        { status: 500 }
      );
    }

    // Format response
    const formatted = (threads || []).map((thread: any) => ({
      id: thread.id,
      leadId: thread.lead_id,
      lead: thread.leads
        ? {
            id: thread.leads.id,
            name:
              thread.leads.first_name || thread.leads.last_name
                ? `${thread.leads.first_name || ""} ${thread.leads.last_name || ""}`.trim()
                : thread.leads.name || thread.leads.email,
            email: thread.leads.email,
            phone: thread.leads.phone,
            status: thread.leads.status,
          }
        : null,
      lastMessage: thread.last_message,
      summary: thread.summary,
      intent: thread.last_intent,
      urgency: thread.urgency,
      status: thread.status,
      unreadCount: thread.unread_count || 0,
      updatedAt: thread.updated_at,
      createdAt: thread.created_at,
    }));

    // Get counts for filters
    const { data: allThreads } = await supabaseAdmin
      .from("inbox_threads")
      .select("last_intent, urgency, unread_count")
      .eq("workspace_id", workspace_id);

    const counts = {
      all: (allThreads || []).length,
      urgent: (allThreads || []).filter((t: any) => t.urgency === "urgent").length,
      unread: (allThreads || []).filter((t: any) => (t.unread_count || 0) > 0).length,
      booking_request: (allThreads || []).filter((t: any) => t.last_intent === "booking_request").length,
      price_question: (allThreads || []).filter((t: any) => t.last_intent === "price_question").length,
      leak_emergency: (allThreads || []).filter((t: any) => t.last_intent === "leak_emergency").length,
      ready_to_move_forward: (allThreads || []).filter((t: any) => t.last_intent === "ready_to_move_forward").length,
      complaint: (allThreads || []).filter((t: any) => t.last_intent === "complaint").length,
    };

    return NextResponse.json({
      threads: formatted,
      counts,
      hasMore: formatted.length === limit,
    });
  } catch (error) {
    console.error("Error in threads API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
