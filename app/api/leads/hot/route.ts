import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type HotLeadRow = {
  lead_id: string;
  lead_name: string | null;
  lead_email: string | null;
  lead_phone: string | null;
  last_hot_reply_at: string;
  hot_reply_count: number;
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
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 25, 100) : 25;

  const { data, error } = await supabase
    .from("hot_leads")
    .select("*")
    .order("last_hot_reply_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching hot leads:", error);
    return NextResponse.json(
      { error: "Failed to fetch hot leads" },
      { status: 500 }
    );
  }

  return NextResponse.json((data ?? []) as HotLeadRow[]);
}

























































