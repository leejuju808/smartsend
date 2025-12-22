import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type CampaignPerformanceRow = {
  campaign_id: string;
  campaign_name: string | null;
  created_at: string;
  total_sends: number;
  total_replies: number;
  hot_replies: number;
  total_leads: number;
  open_pipeline_value: number;
};

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 100) : 50;

  const { data, error } = await supabase
    .from("campaign_performance")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching campaign performance:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign performance" },
      { status: 500 }
    );
  }

  return NextResponse.json((data ?? []) as CampaignPerformanceRow[]);
}

























































