import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/campaign-templates/personas
 * Create a new persona
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    if (!body.name || !body.voice_guidelines) {
      return NextResponse.json(
        { error: "Name and voice_guidelines are required" },
        { status: 400 }
      );
    }

    // Get user's org_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("current_org_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.current_org_id;

    // Create persona
    const { data: persona, error: createError } = await supabase
      .from("ai_personas")
      .insert({
        org_id: orgId,
        name: body.name,
        description: body.description || null,
        voice_guidelines: body.voice_guidelines,
        example_phrases: body.example_phrases || null,
        is_global: false,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating persona:", createError);
      return NextResponse.json(
        { error: "Failed to create persona" },
        { status: 500 }
      );
    }

    return NextResponse.json({ persona });
  } catch (error: any) {
    console.error("Create persona error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























