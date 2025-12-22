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

    // Get step_id from campaign_steps
    const { data: stepData, error: stepError } = await supabase
      .from("campaign_steps")
      .select("id, step_no, campaign_id")
      .eq("id", stepId)
      .single();

    if (stepError || !stepData) {
      return NextResponse.json(
        { error: "Step not found" },
        { status: 404 }
      );
    }

    // Get variants for this step
    const { data: variants, error: variantsError } = await supabase
      .from("campaign_step_variants")
      .select("id, name")
      .eq("campaign_id", stepData.campaign_id)
      .eq("step_no", stepData.step_no)
      .eq("enabled", true);

    if (variantsError) {
      console.error("Error fetching variants:", variantsError);
      return NextResponse.json(
        { error: variantsError.message },
        { status: 500 }
      );
    }

    if (!variants || variants.length === 0) {
      return NextResponse.json({ variants: [] });
    }

    // Get stats for each variant
    const variantStatsPromises = variants.map(async (variant) => {
      const { data: stats, error: statsError } = await supabase.rpc(
        "get_variant_stats",
        {
          p_variant_id: variant.id,
        }
      );

      if (statsError || !stats || stats.length === 0) {
        return {
          variant_id: variant.id,
          variant_name: variant.name,
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          replied: 0,
          bounced: 0,
          spam: 0,
          open_rate: 0,
          click_rate: 0,
          reply_rate: 0,
          bounce_rate: 0,
          spam_rate: 0,
          delivery_rate: 0,
        };
      }

      return {
        variant_id: variant.id,
        variant_name: variant.name,
        ...stats[0],
      };
    });

    const variantStats = await Promise.all(variantStatsPromises);

    return NextResponse.json({ variants: variantStats });
  } catch (error: any) {
    console.error("Failed to fetch variant stats:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch variant stats" },
      { status: 500 }
    );
  }
}

