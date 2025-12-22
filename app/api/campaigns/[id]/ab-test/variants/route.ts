import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const campaignId = params.id;

  try {
    const { data: variants, error } = await supabase
      .from("v_ab_variant_performance")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("variant_label");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(variants || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const campaignId = params.id;

  try {
    const body = await req.json();
    const { variant_label, subject, body: bodyText, persona_id } = body;

    if (!variant_label || !subject || !bodyText) {
      return NextResponse.json(
        { error: "variant_label, subject, and body are required" },
        { status: 400 }
      );
    }

    // Create variant
    const { data: variant, error: variantError } = await supabase
      .from("ab_variants")
      .insert({
        campaign_id: campaignId,
        variant_label: variant_label.toUpperCase(),
        subject,
        body: bodyText,
        persona_id: persona_id || null,
      })
      .select()
      .single();

    if (variantError) {
      return NextResponse.json({ error: variantError.message }, { status: 500 });
    }

    // Initialize metrics
    const { error: metricsError } = await supabase.rpc("initialize_ab_metrics", {
      p_variant_id: variant.id,
    });

    if (metricsError) {
      console.error("Failed to initialize metrics:", metricsError);
    }

    return NextResponse.json(variant);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}



























