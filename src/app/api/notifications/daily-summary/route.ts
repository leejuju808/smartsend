/**
 * GET /api/notifications/daily-summary
 * Get daily summary for current user
 * 
 * Query params:
 * - date: YYYY-MM-DD (default: today)
 */

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

    const searchParams = req.nextUrl.searchParams;
    const dateParam = searchParams.get("date");
    const summaryDate = dateParam ? new Date(dateParam) : new Date();

    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Get daily summary
    const { data: summary, error } = await supabase
      .from("daily_summaries")
      .select("*")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .eq("summary_date", summaryDate.toISOString().split("T")[0])
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If no summary exists, generate one
    if (!summary) {
      const { data: generatedId, error: genError } = await supabase.rpc(
        "generate_daily_summary",
        {
          p_org_id: orgId,
          p_user_id: user.id,
          p_summary_date: summaryDate.toISOString().split("T")[0],
        }
      );

      if (genError) {
        return NextResponse.json({ error: genError.message }, { status: 500 });
      }

      // Fetch the generated summary
      const { data: newSummary, error: fetchError } = await supabase
        .from("daily_summaries")
        .select("*")
        .eq("id", generatedId)
        .single();

      if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
      }

      return NextResponse.json({ data: newSummary });
    }

    return NextResponse.json({ data: summary });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































