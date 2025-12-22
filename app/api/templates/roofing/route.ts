import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = createClient();

  try {
    const { data: templates, error } = await supabase
      .from("roofing_templates")
      .select(
        `
        id,
        name,
        description,
        recommended_for,
        roofing_template_steps (
          id,
          step_order,
          delay_days,
          subject,
          body
        )
      `
      )
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading templates:", error);
      return NextResponse.json(
        { error: "Failed to load templates" },
        { status: 500 }
      );
    }

    // Sort steps by step_order for each template
    const templatesWithSortedSteps = templates?.map((template) => ({
      ...template,
      roofing_template_steps: template.roofing_template_steps
        ?.sort((a: any, b: any) => a.step_order - b.step_order)
        .map((step: any) => ({
          step: step.step_order,
          subject: step.subject,
          body: step.body,
          delayDays: step.delay_days,
        })) || [],
    }));

    return NextResponse.json({ templates: templatesWithSortedSteps || [] }, { status: 200 });
  } catch (err: any) {
    console.error("Error in GET /api/templates/roofing:", err);
    return NextResponse.json(
      { error: "Internal error", details: err.message },
      { status: 500 }
    );
  }
}

