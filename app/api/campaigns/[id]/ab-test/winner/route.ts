import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const campaignId = params.id;

  try {
    const { data: winner, error } = await supabase
      .from("ab_winners")
      .select("*")
      .eq("campaign_id", campaignId)
      .single();

    if (error && error.code !== "PGRST116") { // PGRST116 = not found
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(winner || null);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}



























