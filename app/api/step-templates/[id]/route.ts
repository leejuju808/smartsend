import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";

// PATCH /api/step-templates/[id] - Update a step template
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const { name, subject, body } = await req.json();

    // Verify template belongs to user's org
    const { data: existing, error: checkError } = await supabase
      .from("step_templates")
      .select("org_id, user_id")
      .eq("id", id)
      .single();

    if (checkError || !existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (existing.org_id !== orgId || existing.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (subject !== undefined) updates.subject = subject;
    if (body !== undefined) updates.body = body;

    const { data: template, error } = await supabase
      .from("step_templates")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating step template:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ template });
  } catch (error: any) {
    console.error("Error in PATCH /api/step-templates/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/step-templates/[id] - Delete a step template
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Verify template belongs to user's org
    const { data: existing, error: checkError } = await supabase
      .from("step_templates")
      .select("org_id, user_id")
      .eq("id", id)
      .single();

    if (checkError || !existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (existing.org_id !== orgId || existing.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { error } = await supabase
      .from("step_templates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting step template:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/step-templates/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























































