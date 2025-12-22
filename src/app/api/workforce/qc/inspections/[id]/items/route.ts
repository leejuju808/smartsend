// GET /api/workforce/qc/inspections/[id]/items - Get inspection items
// POST /api/workforce/qc/inspections/[id]/items - Create/update inspection item

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    const { data, error } = await supabase
      .from("qc_inspection_items")
      .select("*")
      .eq("inspection_id", id)
      .order("category", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching inspection items:", error);
      return NextResponse.json(
        { error: "Failed to fetch inspection items" },
        { status: 500 }
      );
    }

    return NextResponse.json({ items: data || [] });
  } catch (error) {
    console.error("Error in inspection items GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: inspectionId } = await params;
    const body = await req.json();
    const { item_id, template_id, category, item, passed, photo_url, notes } = body;

    if (!template_id && !item) {
      return NextResponse.json(
        { error: "Missing required field: template_id or item" },
        { status: 400 }
      );
    }

    // If item_id provided, update existing item
    if (item_id) {
      const { data, error } = await supabase
        .from("qc_inspection_items")
        .update({
          passed,
          photo_url,
          notes,
        })
        .eq("id", item_id)
        .eq("inspection_id", inspectionId)
        .select()
        .single();

      if (error) {
        console.error("Error updating inspection item:", error);
        return NextResponse.json(
          { error: "Failed to update inspection item" },
          { status: 500 }
        );
      }

      return NextResponse.json({ item: data });
    }

    // Otherwise, create new item
    // Get template data if template_id provided
    let templateData = null;
    if (template_id) {
      const { data: template } = await supabase
        .from("qc_checklist_templates")
        .select("*")
        .eq("id", template_id)
        .single();

      if (template) {
        templateData = template;
      }
    }

    const { data, error } = await supabase
      .from("qc_inspection_items")
      .insert({
        inspection_id: inspectionId,
        template_id: template_id || null,
        category: category || templateData?.category || null,
        item: item || templateData?.item || null,
        passed,
        photo_url,
        notes,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating inspection item:", error);
      return NextResponse.json(
        { error: "Failed to create inspection item" },
        { status: 500 }
      );
    }

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    console.error("Error in inspection items POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
























