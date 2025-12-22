// GET /api/workforce/qc/inspections/[id] - Get inspection with items
// PUT /api/workforce/qc/inspections/[id] - Update inspection
// POST /api/workforce/qc/inspections/[id]/complete - Complete inspection

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

    // Get inspection with details
    const { data: inspection, error: inspectionError } = await supabase
      .from("qc_inspections")
      .select(`
        *,
        foreman:foreman_id (
          id,
          first_name,
          last_name,
          role
        )
      `)
      .eq("id", id)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 }
      );
    }

    // Get inspection items
    const { data: items, error: itemsError } = await supabase
      .from("qc_inspection_items")
      .select("*")
      .eq("inspection_id", id)
      .order("category", { ascending: true })
      .order("created_at", { ascending: true });

    if (itemsError) {
      console.error("Error fetching inspection items:", itemsError);
    }

    // Get punch list items
    const { data: punchList, error: punchListError } = await supabase
      .from("qc_punch_list")
      .select(`
        *,
        assigned_employee:assigned_to (
          id,
          first_name,
          last_name
        )
      `)
      .eq("inspection_id", id)
      .order("created_at", { ascending: false });

    if (punchListError) {
      console.error("Error fetching punch list:", punchListError);
    }

    // Get customer signoff if exists
    const { data: signoff } = await supabase
      .from("customer_signoff")
      .select("*")
      .eq("inspection_id", id)
      .single();

    return NextResponse.json({
      inspection: {
        ...inspection,
        items: items || [],
        punch_list_items: punchList || [],
        customer_signoff: signoff || null,
      },
    });
  } catch (error) {
    console.error("Error in QC inspection GET:", error);
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
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const { data, error } = await supabase
      .from("qc_inspections")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating QC inspection:", error);
      return NextResponse.json(
        { error: "Failed to update QC inspection" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ inspection: data });
  } catch (error) {
    console.error("Error in QC inspection PUT:", error);
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

    const { id } = await params;
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get("action");

    if (action === "complete") {
      const { data, error } = await supabase
        .from("qc_inspections")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error completing QC inspection:", error);
        return NextResponse.json(
          { error: "Failed to complete QC inspection" },
          { status: 500 }
        );
      }

      if (!data) {
        return NextResponse.json(
          { error: "Inspection not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ inspection: data });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in QC inspection POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
























