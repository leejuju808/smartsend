// Block 28844 — Quote Revival Engine API
// GET /api/quotes/revival/events?quote_id=xxx - Get revival events for a quote

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      cookieStore.get("sb-access-token")?.value || ""
    );

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const quoteId = searchParams.get("quote_id");

    if (!quoteId) {
      return NextResponse.json(
        { error: "quote_id query parameter required" },
        { status: 400 }
      );
    }

    // Verify user has access to the quote
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select(`
        id,
        lead_id,
        leads:lead_id (
          id,
          workspace_id
        )
      `)
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    const lead = quote.leads as any;
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Check workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", lead.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get revival events for this quote
    const { data: events, error: eventsError } = await supabase
      .from("revival_events")
      .select("*")
      .eq("quote_id", quoteId)
      .order("scheduled_at", { ascending: true });

    if (eventsError) {
      console.error("Error fetching revival events:", eventsError);
      return NextResponse.json({ error: eventsError.message }, { status: 500 });
    }

    return NextResponse.json(events || []);
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


































