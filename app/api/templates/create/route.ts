import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, description, persona, visibility, steps } = await req.json();

    if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json(
        { error: "name and steps are required" },
        { status: 400 }
      );
    }

    // 1. Create template
    const { data: template, error: templateError } = await supabase
      .from("sequence_templates")
      .insert({
        name,
        description: description || null,
        persona: persona || null,
        visibility: visibility ?? "private",
        created_by: user.id,
      })
      .select()
      .single();

    if (templateError) {
      return NextResponse.json(
        { error: templateError.message },
        { status: 500 }
      );
    }

    if (!template) {
      return NextResponse.json(
        { error: "Failed to create template" },
        { status: 500 }
      );
    }

    // 2. Insert steps
    const payload = steps.map((s: any, idx: number) => ({
      template_id: template.id,
      step_number: idx + 1,
      delay_hours: s.delay_hours || 0,
      subject: s.subject || "",
      body: s.body || "",
    }));

    const { error: stepsError } = await supabase
      .from("sequence_template_steps")
      .insert(payload);

    if (stepsError) {
      // Rollback template creation if steps fail
      await supabase
        .from("sequence_templates")
        .delete()
        .eq("id", template.id);

      return NextResponse.json(
        { error: stepsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, template_id: template.id });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create template" },
      { status: 500 }
    );
  }
}
