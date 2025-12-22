import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get estimates in the next 3 days
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const { data: estimates, error } = await supabase
      .from("estimates")
      .select(
        `
        id,
        lead_id,
        start_time,
        location,
        lead:leads (
          id,
          first_name,
          last_name,
          email
        )
      `
      )
      .eq("status", "scheduled")
      .gte("start_time", now.toISOString())
      .lte("start_time", threeDaysFromNow.toISOString())
      .order("start_time", { ascending: true })
      .limit(20);

    if (error) {
      console.error("Error fetching upcoming estimates:", error);
      return NextResponse.json(
        { error: "Failed to fetch estimates" },
        { status: 500 }
      );
    }

    return NextResponse.json({ estimates: estimates || [] });
  } catch (error) {
    console.error("Error in upcoming estimates API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}














































