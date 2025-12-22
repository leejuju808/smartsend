import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * PUT /api/campaign-templates/personas/[id]
 * Update a persona
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const personaId = params.id;
    const body = await req.json();

    // Get user's org_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("current_org_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.current_org_id;

    // Check if persona exists and belongs to user's org
    const { data: existing } = await supabase
      .from("ai_personas")
      .select("org_id, is_global")
      .eq("id", personaId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    if (existing.is_global) {
      return NextResponse.json(
        { error: "Cannot edit global personas" },
        { status: 403 }
      );
    }

    if (existing.org_id !== orgId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Update persona
    const { error: updateError } = await supabase
      .from("ai_personas")
      .update({
        name: body.name,
        description: body.description || null,
        voice_guidelines: body.voice_guidelines,
        example_phrases: body.example_phrases || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", personaId);

    if (updateError) {
      console.error("Error updating persona:", updateError);
      return NextResponse.json(
        { error: "Failed to update persona" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Update persona error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/campaign-templates/personas/[id]
 * Delete a persona
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const personaId = params.id;

    // Get user's org_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("current_org_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.current_org_id;

    // Check if persona exists and belongs to user's org
    const { data: existing } = await supabase
      .from("ai_personas")
      .select("org_id, is_global")
      .eq("id", personaId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    if (existing.is_global) {
      return NextResponse.json(
        { error: "Cannot delete global personas" },
        { status: 403 }
      );
    }

    if (existing.org_id !== orgId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Delete persona
    const { error: deleteError } = await supabase
      .from("ai_personas")
      .delete()
      .eq("id", personaId);

    if (deleteError) {
      console.error("Error deleting persona:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete persona" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete persona error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























