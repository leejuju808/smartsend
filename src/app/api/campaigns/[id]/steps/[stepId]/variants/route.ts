import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/campaigns/[id]/steps/[stepId]/variants
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; stepId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: variants, error } = await supabase
      .from("sequence_step_variants")
      .select("*")
      .eq("step_id", params.stepId)
      .order("variant_key", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ variants: variants || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load variants" }, { status: 500 });
  }
}

// POST /api/campaigns/[id]/steps/[stepId]/variants
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; stepId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { variants } = body;

    if (!Array.isArray(variants)) {
      return NextResponse.json({ error: "variants must be an array" }, { status: 400 });
    }

    // Verify step exists and belongs to campaign
    const { data: step, error: stepError } = await supabase
      .from("campaign_steps")
      .select("id, campaign_id")
      .eq("id", params.stepId)
      .eq("campaign_id", params.id)
      .single();

    if (stepError || !step) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    // Delete existing variants for this step
    await supabase
      .from("sequence_step_variants")
      .delete()
      .eq("step_id", params.stepId);

    // Insert new variants
    const variantsToInsert = variants.map((v: any) => ({
      step_id: params.stepId,
      variant_key: v.variant_key,
      subject: v.subject || null,
      body: v.body || null,
    }));

    const { data: insertedVariants, error: insertError } = await supabase
      .from("sequence_step_variants")
      .insert(variantsToInsert)
      .select();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      variants: insertedVariants 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save variants" }, { status: 500 });
  }
}

// DELETE /api/campaigns/[id]/steps/[stepId]/variants
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; stepId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete all variants for this step
    const { error } = await supabase
      .from("sequence_step_variants")
      .delete()
      .eq("step_id", params.stepId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete variants" }, { status: 500 });
  }
}





























































