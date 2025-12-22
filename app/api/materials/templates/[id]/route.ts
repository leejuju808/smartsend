// Block 89000 — Material Template API (single template)
// GET /api/materials/templates/[id] - Get template
// PUT /api/materials/templates/[id] - Update template
// DELETE /api/materials/templates/[id] - Delete template

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get template with items
    const { data: template, error } = await supabase
      .from("material_templates")
      .select(`
        *,
        material_template_items (
          id,
          item_name,
          unit,
          quantity_per_sq,
          cost_per_unit
        )
      `)
      .eq("id", id)
      .single();

    if (error || !template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Verify access
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", template.team_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error("Error in GET /api/materials/templates/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Get template to verify access
    const { data: template } = await supabase
      .from("material_templates")
      .select("team_id")
      .eq("id", id)
      .single();

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Verify access
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", template.team_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Update template
    const { name, manufacturer, shingle_line, waste_factor, roof_type, color, notes } = body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (manufacturer !== undefined) updateData.manufacturer = manufacturer;
    if (shingle_line !== undefined) updateData.shingle_line = shingle_line;
    if (waste_factor !== undefined) updateData.waste_factor = waste_factor;
    if (roof_type !== undefined) updateData.roof_type = roof_type;
    if (color !== undefined) updateData.color = color;
    if (notes !== undefined) updateData.notes = notes;

    const { data: updatedTemplate, error: updateError } = await supabase
      .from("material_templates")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating template:", updateError);
      return NextResponse.json(
        { error: "Failed to update template" },
        { status: 500 }
      );
    }

    // Update items if provided
    if (body.items && Array.isArray(body.items)) {
      // Delete existing items
      await supabase
        .from("material_template_items")
        .delete()
        .eq("template_id", id);

      // Insert new items
      if (body.items.length > 0) {
        const itemsToInsert = body.items.map((item: any) => ({
          template_id: id,
          item_name: item.item_name,
          unit: item.unit,
          quantity_per_sq: item.quantity_per_sq,
          cost_per_unit: item.cost_per_unit || null,
        }));

        await supabase.from("material_template_items").insert(itemsToInsert);
      }
    }

    // Fetch updated template with items
    const { data: templateWithItems } = await supabase
      .from("material_templates")
      .select(`
        *,
        material_template_items (
          id,
          item_name,
          unit,
          quantity_per_sq,
          cost_per_unit
        )
      `)
      .eq("id", id)
      .single();

    return NextResponse.json({ template: templateWithItems });
  } catch (error) {
    console.error("Error in PUT /api/materials/templates/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get template to verify access
    const { data: template } = await supabase
      .from("material_templates")
      .select("team_id")
      .eq("id", id)
      .single();

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Verify access
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", template.team_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Delete template (cascade will delete items)
    const { error: deleteError } = await supabase
      .from("material_templates")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Error deleting template:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete template" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/materials/templates/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



























