// app/api/owner/weekly-wins/route.ts
// Block 21723 — SmartSend Roofing "This Week's Wins" Dashboard Section v1
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const companyId = user.user_metadata?.company_id;
    if (!companyId)
      return NextResponse.json({ error: "Missing company_id" }, { status: 400 });

    const { data, error } = await supabase
      .from("company_weekly_wins_view")
      .select(`
        hot_leads,
        warm_leads,
        jobs_booked,
        booked_value,
        biggest_job_value
      `)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "Failed to load wins" }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? null });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}











































