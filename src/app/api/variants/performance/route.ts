import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get org_id from query params (optional - if not provided, RLS will filter by user's orgs)
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("org_id");

    // Query variant_performance view (RLS will filter by org membership)
    let query = supabase
      .from("variant_performance")
      .select("*")
      .order("reply_rate_pct", { ascending: false });

    if (orgId) {
      query = query.eq("org_id", orgId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching variant performance:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data || [], { status: 200 });
  } catch (error: any) {
    console.error("Error in variant performance API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

