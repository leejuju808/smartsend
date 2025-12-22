import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const campaignId = params.id;

  try {
    const body = await req.json();
    const { variant_id } = body;

    if (!variant_id) {
      return NextResponse.json({ error: "variant_id is required" }, { status: 400 });
    }

    // Get variant to build reason
    const { data: variant, error: variantError } = await supabase
      .from("ab_variants")
      .select("variant_label")
      .eq("id", variant_id)
      .single();

    if (variantError) {
      return NextResponse.json({ error: variantError.message }, { status: 500 });
    }

    // Get metrics for reason
    const { data: metrics, error: metricsError } = await supabase
      .from("ab_metrics")
      .select("*")
      .eq("variant_id", variant_id)
      .single();

    const reason = metrics
      ? `Manually selected: Variant ${variant.variant_label} - ${metrics.sends} sends, ${metrics.replies} replies (${metrics.sends > 0 ? ((metrics.replies / metrics.sends) * 100).toFixed(1) : 0}%), ${metrics.booked_estimates} booked, ${metrics.closed_jobs} closed`
      : `Manually selected: Variant ${variant.variant_label}`;

    // Insert or update winner
    const { data: winner, error: winnerError } = await supabase
      .from("ab_winners")
      .upsert({
        campaign_id: campaignId,
        winning_variant: variant_id,
        reason,
      }, {
        onConflict: "campaign_id",
      })
      .select()
      .single();

    if (winnerError) {
      return NextResponse.json({ error: winnerError.message }, { status: 500 });
    }

    return NextResponse.json(winner);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}



























