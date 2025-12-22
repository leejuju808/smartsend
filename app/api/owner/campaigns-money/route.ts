// app/api/owner/campaigns-money/route.ts
// Block 21724 — SmartSend Roofing Per-Campaign Money View v1
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = user.user_metadata?.company_id;
    if (!companyId) {
      return NextResponse.json({ error: "Missing company_id" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("campaign_money_view")
      .select(
        `
        campaign_id,
        campaign_name,
        leads_count,
        hot_leads,
        warm_leads,
        not_interested_leads,
        pipeline_value,
        booked_value,
        hot_rate_percent,
        opp_rate_percent
      `
      )
      .eq("company_id", companyId)
      .order("booked_value", { ascending: false });

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to load campaign money view" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? [] }, { status: 200 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}











































