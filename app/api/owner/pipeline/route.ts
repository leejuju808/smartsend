// app/api/owner/pipeline/route.ts
// Block 21722 — SmartSend Roofing Job Pipeline "Money Board" v1
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
      .from("company_job_pipeline_view")
      .select(
        `
        new_count,
        working_count,
        booked_count,
        lost_count,
        cold_count,
        new_value,
        working_value,
        booked_value,
        lost_value,
        cold_value,
        pipeline_value,
        won_value
      `
      )
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to load pipeline" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? null }, { status: 200 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}











































