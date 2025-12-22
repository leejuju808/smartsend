import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/marketplace/agents/list
 * List marketplace agents with optional filtering
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    const sort = url.searchParams.get("sort") || "downloads"; // downloads | rating | new

    let query = sb
      .from("marketplace_agents")
      .select(`
        *,
        creator:profiles!marketplace_agents_creator_id_fkey(id, full_name, email)
      `)
      .eq("visibility", "public");

    // Apply category filter
    if (category && ["outreach", "follow-up", "reactivation"].includes(category)) {
      query = query.eq("category", category);
    }

    // Apply sorting
    switch (sort) {
      case "rating":
        query = query.order("rating", { ascending: false });
        break;
      case "new":
        query = query.order("created_at", { ascending: false });
        break;
      case "downloads":
      default:
        query = query.order("downloads", { ascending: false });
        break;
    }

    const { data: agents, error } = await query;

    if (error) {
      console.error("Error fetching agents:", error);
      return NextResponse.json(
        { error: "Failed to fetch agents", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(agents || []);
  } catch (error: any) {
    console.error("List agents error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

