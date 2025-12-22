import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET /api/templates/sequences
// Fetch all sequence templates with their steps
export async function GET() {
  try {
    const supabase = createServiceClient();

    // Fetch all templates
    const { data: templates, error: templatesError } = await supabase
      .from("sequence_templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (templatesError) {
      return NextResponse.json(
        { error: templatesError.message },
        { status: 500 }
      );
    }

    if (!templates || templates.length === 0) {
      return NextResponse.json({ templates: [] });
    }

    // Fetch steps for all templates
    const templateIds = templates.map((t) => t.id);
    const { data: steps, error: stepsError } = await supabase
      .from("sequence_template_steps")
      .select("*")
      .in("template_id", templateIds)
      .order("template_id, step_number", { ascending: true });

    if (stepsError) {
      return NextResponse.json(
        { error: stepsError.message },
        { status: 500 }
      );
    }

    // Group steps by template_id
    const stepsByTemplate = new Map<string, typeof steps>();
    steps?.forEach((step) => {
      if (!stepsByTemplate.has(step.template_id)) {
        stepsByTemplate.set(step.template_id, []);
      }
      stepsByTemplate.get(step.template_id)!.push(step);
    });

    // Attach steps to templates
    const templatesWithSteps = templates.map((template) => ({
      ...template,
      steps: stepsByTemplate.get(template.id) || [],
    }));

    return NextResponse.json({ templates: templatesWithSteps });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to fetch templates" },
      { status: 500 }
    );
  }
}



