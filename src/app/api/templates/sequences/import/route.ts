import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

// POST /api/templates/sequences/import
// Import a sequence template into a campaign
export async function POST(req: Request) {
  try {
    const { template_id, campaign_id } = await req.json();

    if (!template_id || !campaign_id) {
      return NextResponse.json(
        { error: "template_id and campaign_id are required" },
        { status: 400 }
      );
    }

    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify campaign ownership
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, user_id")
      .eq("id", campaign_id)
      .eq("user_id", user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found or access denied" },
        { status: 404 }
      );
    }

    // Load template steps
    const { data: steps, error: stepsError } = await supabase
      .from("sequence_template_steps")
      .select("*")
      .eq("template_id", template_id)
      .order("step_number", { ascending: true });

    if (stepsError) {
      return NextResponse.json(
        { error: stepsError.message },
        { status: 500 }
      );
    }

    if (!steps || steps.length === 0) {
      return NextResponse.json(
        { error: "Template has no steps" },
        { status: 400 }
      );
    }

    // Import steps into campaign_steps
    // Map template step structure to campaign_steps structure
    // Based on the API route, campaign_steps uses: step_no, subject, body, delay_hours
    const campaignSteps = steps.map((step) => ({
      campaign_id: campaign_id,
      step_no: step.step_number,
      subject: step.subject || "",
      body: step.body || "",
      delay_hours: step.delay_hours,
      label: `Step ${step.step_number}`,
    }));

    // Delete existing steps for this campaign (optional - you might want to append instead)
    // For now, we'll replace them
    const { error: deleteError } = await supabase
      .from("campaign_steps")
      .delete()
      .eq("campaign_id", campaign_id);

    if (deleteError) {
      console.error("Error deleting existing steps:", deleteError);
      // Continue anyway - might be first import
    }

    // Insert new steps
    const { error: insertError } = await supabase
      .from("campaign_steps")
      .insert(campaignSteps);

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imported_steps: campaignSteps.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to import template" },
      { status: 500 }
    );
  }
}



