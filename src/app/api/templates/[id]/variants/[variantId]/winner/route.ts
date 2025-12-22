import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * POST /api/templates/[id]/variants/[variantId]/winner
 * Mark a variant as the winner for a template
 * Sets is_winner = true for the variant and adjusts weights (winner → 100, others → 0)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; variantId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Check access (owner or workspace member with editor+ role)
    if (template.owner_id !== user.id) {
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

    // Verify variant belongs to this template
    const { data: variant, error: variantError } = await supabase
      .from("template_variants")
      .select("id, template_id")
      .eq("id", params.variantId)
      .eq("template_id", params.id)
      .single();

    if (variantError || !variant) {
      return NextResponse.json(
        { error: "Variant not found or does not belong to this template" },
        { status: 404 }
      );
    }

    // Call RPC function to mark winner
    const { error: updateError } = await supabase.rpc("mark_variant_winner", {
      p_template_id: params.id,
      p_variant_id: params.variantId,
    });

    if (updateError) {
      console.error("Error marking variant as winner:", updateError);
      return NextResponse.json(
        { error: "Failed to mark variant as winner", details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error in mark variant winner:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








