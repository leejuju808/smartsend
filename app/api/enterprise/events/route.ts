import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "unresolved";
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's company
    const { data: company } = await supabase
      .from("roofing_companies")
      .select("id")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!company) {
      return NextResponse.json({ error: "No company found" }, { status: 404 });
    }

    // Build query
    let query = supabase
      .from("enterprise_events")
      .select(`
        *,
        branches:branch_id (
          name
        )
      `)
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });

    if (filter === "unresolved") {
      query = query.eq("is_resolved", false);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error("Error fetching events:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Format events with branch names
    const formattedEvents = (events || []).map((event: any) => ({
      ...event,
      branch_name: event.branches?.name || null,
    }));

    return NextResponse.json({ events: formattedEvents });
  } catch (error: any) {
    console.error("Error in events API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}






















