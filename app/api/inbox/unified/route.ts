// Block 150000 — Unified Messaging Inbox API
// GET /api/inbox/unified
// Returns unified inbox data from all channels

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const companyId = searchParams.get("company_id");
    const filter = searchParams.get("filter") || "all"; // all, unread, hot

    if (!companyId) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    // Build query for unified inbox view
    let query = supabase
      .from("messages_inbox_view")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    // Apply filters
    if (filter === "unread") {
      query = query.gt("unread_count", 0);
    } else if (filter === "hot") {
      query = query.gte("heat_score", 70);
    }

    const { data: inboxItems, error } = await query.limit(100);

    if (error) {
      console.error("Error fetching unified inbox:", error);
      return NextResponse.json(
        { error: "Failed to fetch inbox" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      items: inboxItems || [],
    });
  } catch (error: any) {
    console.error("Error in unified inbox API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


























