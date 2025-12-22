import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveOrg } from "@/lib/org";

// GET /api/leads/ai - Fetch AI-prospected leads from ai_leads_queue
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "10");
    const orderBy = searchParams.get("order") || "score.desc";

    // Parse order (e.g., "score.desc" -> { column: "score", ascending: false })
    const [column, direction] = orderBy.split(".");
    const ascending = direction === "asc";

    let query = supabase
      .from("ai_leads_queue")
      .select("*")
      .eq("org_id", org.id)
      .order(column || "score", { ascending })
      .limit(limit);

    const { data: leads, error } = await query;

    if (error) {
      console.error("Error fetching AI leads:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(leads || []);
  } catch (error: any) {
    console.error("Error in GET /api/leads/ai:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

