import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Returns the current user's daily send stats and plan limits
export async function GET(_req: NextRequest) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return NextResponse.json({ error: "not_auth" }, { status: 401 });
  }

  // Get user's plan and daily send stats
  const { data: limitData, error: limitError } = await supabase.rpc(
    "check_daily_send_limit",
    {
      p_user_id: user.id,
      p_count: 0, // Just checking, not consuming
      p_date: new Date().toISOString().split("T")[0], // Today's date
    }
  );

  if (limitError) {
    console.error("Error checking daily send limit:", limitError);
    return NextResponse.json(
      { error: "Failed to fetch daily send stats" },
      { status: 500 }
    );
  }

  const result = limitData?.[0];
  if (!result) {
    return NextResponse.json(
      {
        sends_today: 0,
        daily_limit: 50,
        remaining: 50,
        plan: "free",
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      sends_today: result.sends_today || 0,
      daily_limit: result.daily_limit || 50,
      remaining: result.remaining || 0,
      plan: result.effective_plan || "free",
      can_send: result.can_send ?? true,
    },
    { status: 200 }
  );
}































































