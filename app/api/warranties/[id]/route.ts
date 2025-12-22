// Block 92000 — SmartSend Roofing Warranty Detail API v1

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: Get warranty by ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: warranty, error } = await supabase
      .from("warranties")
      .select(`
        *,
        job:roofing_jobs(
          id,
          title,
          address
        ),
        service_tickets:service_tickets(
          id,
          issue_description,
          ticket_status,
          created_at
        )
      `)
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching warranty:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch warranty" },
        { status: 500 }
      );
    }

    if (!warranty) {
      return NextResponse.json(
        { error: "Warranty not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ warranty }, { status: 200 });
  } catch (error: any) {
    console.error("Error in GET /api/warranties/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH: Update warranty
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const updateData: any = {};

    if (body.warranty_type !== undefined) updateData.warranty_type = body.warranty_type;
    if (body.warranty_length_years !== undefined) updateData.warranty_length_years = body.warranty_length_years;
    if (body.start_date !== undefined) updateData.start_date = body.start_date;
    if (body.coverage_description !== undefined) updateData.coverage_description = body.coverage_description;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;

    const { data: warranty, error } = await supabase
      .from("warranties")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        job:roofing_jobs(
          id,
          title,
          address
        )
      `)
      .single();

    if (error) {
      console.error("Error updating warranty:", error);
      return NextResponse.json(
        { error: error.message || "Failed to update warranty" },
        { status: 500 }
      );
    }

    return NextResponse.json({ warranty }, { status: 200 });
  } catch (error: any) {
    console.error("Error in PATCH /api/warranties/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
