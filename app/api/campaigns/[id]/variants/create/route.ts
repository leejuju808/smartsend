import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: campaign_id } = params;
    const { name, subject, body, weight } = await req.json();

    if (!name || !subject || !body) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: name, subject, body" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Verify user has access to this campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, user_id")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { ok: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Insert variant
    const { data: variant, error: insertError } = await supabase
      .from("template_variants")
      .insert({
        campaign_id,
        template_id: null,
        name,
        subject,
        body,
        weight: weight ?? 50,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating variant:", insertError);
      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, variant });
  } catch (error: any) {
    console.error("Error in create variant route:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: campaign_id } = params;
    const { variant_id, name, subject, body, weight } = await req.json();

    if (!variant_id) {
      return NextResponse.json(
        { ok: false, error: "Missing variant_id" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Verify variant belongs to this campaign
    const { data: variant, error: variantError } = await supabase
      .from("template_variants")
      .select("id, campaign_id")
      .eq("id", variant_id)
      .eq("campaign_id", campaign_id)
      .single();

    if (variantError || !variant) {
      return NextResponse.json(
        { ok: false, error: "Variant not found" },
        { status: 404 }
      );
    }

    // Update variant
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (subject !== undefined) updateData.subject = subject;
    if (body !== undefined) updateData.body = body;
    if (weight !== undefined) updateData.weight = weight;

    const { data: updatedVariant, error: updateError } = await supabase
      .from("template_variants")
      .update(updateData)
      .eq("id", variant_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating variant:", updateError);
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, variant: updatedVariant });
  } catch (error: any) {
    console.error("Error in update variant route:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: campaign_id } = params;
    const { searchParams } = new URL(req.url);
    const variant_id = searchParams.get("variant_id");

    if (!variant_id) {
      return NextResponse.json(
        { ok: false, error: "Missing variant_id query parameter" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Verify variant belongs to this campaign
    const { data: variant, error: variantError } = await supabase
      .from("template_variants")
      .select("id, campaign_id")
      .eq("id", variant_id)
      .eq("campaign_id", campaign_id)
      .single();

    if (variantError || !variant) {
      return NextResponse.json(
        { ok: false, error: "Variant not found" },
        { status: 404 }
      );
    }

    // Delete variant
    const { error: deleteError } = await supabase
      .from("template_variants")
      .delete()
      .eq("id", variant_id);

    if (deleteError) {
      console.error("Error deleting variant:", deleteError);
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error in delete variant route:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}










