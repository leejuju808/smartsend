import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/estimates
 * Get estimate for a thread
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("threadId");

    if (!threadId) {
      return NextResponse.json(
        { error: "threadId is required" },
        { status: 400 }
      );
    }

    // Get most recent estimate for thread (including Block 20020 data)
    const { data: estimate, error: estimateError } = await supabase
      .from("estimates")
      .select(`
        *,
        estimate_line_items (*),
        estimate_material_quantities (*),
        estimate_upsells (*),
        estimate_material_brands (*)
      `)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (estimateError) {
      console.error("Error fetching estimate:", estimateError);
      return NextResponse.json(
        { error: "Failed to fetch estimate" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      estimate: estimate || null,
    });
  } catch (error) {
    console.error("Error in GET /api/inbox/estimates:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

