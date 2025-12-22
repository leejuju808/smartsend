import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const campaignId = params.id;

  try {
    // Call the database function to automatically select winner
    const { data: winnerId, error } = await supabase.rpc("select_ab_winner", {
      p_campaign_id: campaignId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!winnerId) {
      return NextResponse.json({ 
        message: "No winner selected - need more data (minimum 10 sends per variant)" 
      });
    }

    // Get winner details
    const { data: winner, error: winnerError } = await supabase
      .from("ab_winners")
      .select("*")
      .eq("campaign_id", campaignId)
      .single();

    if (winnerError) {
      return NextResponse.json({ error: winnerError.message }, { status: 500 });
    }

    return NextResponse.json(winner);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}



























