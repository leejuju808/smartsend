import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * POST /api/templates/[id]/variants/weights
 * Update variant weights for a template
 * Body: { variants: [{ id: "uuid", weight: 70 }, { id: "uuid", weight: 30 }] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { variants } = await req.json();

    if (!variants || !Array.isArray(variants)) {
      return NextResponse.json(
        { error: "variants array is required" },
        { status: 400 }
      );
    }

    // Verify template ownership
    const { data: template, error: templateError } = await supabase
      .from("templates")
      .select("id, owner_id, workspace_id")
      .eq("id", params.id)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Check access (owner or workspace member)
    // Note: Adjust this based on your actual access control logic
    if (template.owner_id !== user.id) {
      // Check workspace membership if workspace_id exists
      if (template.workspace_id) {
        const { data: member } = await supabase
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", template.workspace_id)
          .eq("user_id", user.id)
          .single();

        if (!member || !["owner", "editor", "admin"].includes(member.role)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Validate all variants belong to this template
    const variantIds = variants.map((v: any) => v.id);
    const { data: existingVariants, error: checkError } = await supabase
      .from("template_variants")
      .select("id")
      .eq("template_id", params.id)
      .in("id", variantIds);

    if (checkError) {
      return NextResponse.json(
        { error: "Failed to validate variants" },
        { status: 500 }
      );
    }

    if (existingVariants.length !== variantIds.length) {
      return NextResponse.json(
        { error: "Some variants do not belong to this template" },
        { status: 400 }
      );
    }

    // Call RPC function to update weights (with normalization)
    const { error: updateError } = await supabase.rpc("update_variant_weights", {
      p_template_id: params.id,
      p_variants: variants, // Pass as JSON array directly
    });

    if (updateError) {
      console.error("Error updating variant weights:", updateError);
      return NextResponse.json(
        { error: "Failed to update variant weights", details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error in update variant weights:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

