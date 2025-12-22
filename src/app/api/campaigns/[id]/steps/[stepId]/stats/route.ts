import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; stepId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const stepId = params.stepId;

    // Get step stats
    const { data, error } = await supabase.rpc("get_step_stats", {
      p_step_id: stepId,
    });

    if (error) {
      console.error("Error fetching step stats:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Step stats not found" }, { status: 404 });
    }

    return NextResponse.json(data[0]);
  } catch (error: any) {
    console.error("Failed to fetch step stats:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch stats" },
      { status: 500 }
    );
  }
}

