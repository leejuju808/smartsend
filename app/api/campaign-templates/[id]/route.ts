import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * GET /api/campaign-templates/[id]
 * Get a specific campaign template with all steps
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const templateId = params.id;

    // Fetch template
    const { data: template, error: templateError } = await supabase
      .from("campaign_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Fetch steps
    const { data: steps, error: stepsError } = await supabase
      .from("campaign_template_steps")
      .select("*")
      .eq("template_id", templateId)
      .order("step_order");

    if (stepsError) {
      console.error("Error fetching steps:", stepsError);
      return NextResponse.json(
        { error: "Failed to fetch template steps" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      template: {
        ...template,
        steps: steps || [],
      },
    });
  } catch (error: any) {
    console.error("Template API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
