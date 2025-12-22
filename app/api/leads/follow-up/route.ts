// app/api/leads/follow-up/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type FollowUpLeadRow = {
  lead_id: string;
  lead_name: string | null;
  lead_email: string | null;
  lead_phone: string | null;
  status: string;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
};

export async function GET(req: NextRequest) {
  const supabase = createClient();

  // Check authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 100) : 50;

  const { data, error } = await supabase
    .from("follow_up_leads")
    .select("*")
    .limit(limit);

  if (error) {
    console.error("Error fetching follow-up leads:", error);
    return NextResponse.json(
      { error: "Failed to fetch follow-up leads" },
      { status: 500 }
    );
  }

  return NextResponse.json((data ?? []) as FollowUpLeadRow[]);
}

























































