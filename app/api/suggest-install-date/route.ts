import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { estimated_squares, workspace_id, days_ahead = 30, max_options = 5 } = await req.json();

    if (!estimated_squares || !workspace_id) {
      return NextResponse.json(
        { error: "estimated_squares and workspace_id are required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Call the database function to suggest install dates
    const { data, error } = await supabase.rpc("suggest_install_dates", {
      p_workspace_id: workspace_id,
      p_estimated_squares: parseInt(estimated_squares),
      p_days_ahead: days_ahead,
      p_max_options: max_options,
    });

    if (error) {
      console.error("Error suggesting install dates:", error);
      return NextResponse.json(
        { error: "Failed to suggest install dates", details: error.message },
        { status: 500 }
      );
    }

    // Format the response
    const options = (data || []).map((d: any) => ({
      date: d.work_date,
      total_capacity_squares: d.total_capacity_squares,
      total_scheduled_squares: d.total_scheduled_squares,
      total_remaining_squares: d.total_remaining_squares,
      active_crews_count: d.active_crews_count,
      can_fit: d.can_fit,
    }));

    return NextResponse.json({ options });
  } catch (error: any) {
    console.error("Error in suggest-install-date:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}



































