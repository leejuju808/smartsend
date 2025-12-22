// Block 89000 — Material Templates API
// GET /api/materials/templates - List templates for current team
// POST /api/materials/templates - Create new template

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's teams
    const { data: teamMemberships } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id);

    if (!teamMemberships || teamMemberships.length === 0) {
      return NextResponse.json({ templates: [] });
    }

    const teamIds = teamMemberships.map((tm) => tm.team_id);

    // Get templates with items
    const { data: templates, error } = await supabase
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
      .in("team_id", teamIds)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching templates:", error);
      return NextResponse.json(
        { error: "Failed to fetch templates" },
        { status: 500 }
      );
    }

    return NextResponse.json({ templates: templates || [] });
  } catch (error) {
    console.error("Error in GET /api/materials/templates:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      team_id,
      name,
      manufacturer,
      shingle_line,
      waste_factor,
      roof_type,
      color,
      notes,
      items, // Array of { item_name, unit, quantity_per_sq, cost_per_unit }
    } = body;

    if (!team_id || !name) {
      return NextResponse.json(
        { error: "team_id and name are required" },
        { status: 400 }
      );
    }

    // Verify user is member of team
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", team_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Create template
    const { data: template, error: templateError } = await supabase
      .from("material_templates")
      .insert({
        team_id,
        name,
        manufacturer,
        shingle_line,
        waste_factor: waste_factor || 0.10,
        roof_type,
        color,
        notes,
      })
      .select()
      .single();

    if (templateError || !template) {
      console.error("Error creating template:", templateError);
      return NextResponse.json(
        { error: "Failed to create template" },
        { status: 500 }
      );
    }

    // Add items if provided
    if (items && Array.isArray(items) && items.length > 0) {
      const itemsToInsert = items.map((item: any) => ({
        template_id: template.id,
        item_name: item.item_name,
        unit: item.unit,
        quantity_per_sq: item.quantity_per_sq,
        cost_per_unit: item.cost_per_unit || null,
      }));

      const { error: itemsError } = await supabase
        .from("material_template_items")
        .insert(itemsToInsert);

      if (itemsError) {
        console.error("Error creating template items:", itemsError);
        // Don't fail the whole request, just log it
      }
    } else {
      // Add default items
      const { error: defaultItemsError } = await supabase.rpc(
        "add_default_template_items",
        { p_template_id: template.id }
      );

      if (defaultItemsError) {
        console.error("Error adding default items:", defaultItemsError);
      }
    }

    // Fetch template with items
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
      .eq("id", template.id)
      .single();

    return NextResponse.json({ template: templateWithItems });
  } catch (error) {
    console.error("Error in POST /api/materials/templates:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



























