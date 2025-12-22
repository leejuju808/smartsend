// Block 92000 — SmartSend Roofing Warranty System v1
// API Routes for individual warranty management

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: Get a specific warranty
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ warrantyId: string }> }
) {
  try {
    const supabase = createClient();
    const { warrantyId } = await params;

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
          address,
          status
        )
      `)
      .eq("id", warrantyId)
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
    console.error("Error in GET /api/warranties/[warrantyId]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH: Update a warranty
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ warrantyId: string }> }
) {
  try {
    const supabase = createClient();
    const { warrantyId } = await params;

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

    if (body.homeowner_name !== undefined) updateData.homeowner_name = body.homeowner_name;
    if (body.homeowner_email !== undefined) updateData.homeowner_email = body.homeowner_email;
    if (body.homeowner_phone !== undefined) updateData.homeowner_phone = body.homeowner_phone;
    if (body.warranty_type !== undefined) updateData.warranty_type = body.warranty_type;
    if (body.warranty_length_years !== undefined) updateData.warranty_length_years = body.warranty_length_years;
    if (body.start_date !== undefined) updateData.start_date = body.start_date;
    if (body.end_date !== undefined) updateData.end_date = body.end_date;
    if (body.coverage_description !== undefined) updateData.coverage_description = body.coverage_description;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;

    const { data: warranty, error } = await supabase
      .from("warranties")
      .update(updateData)
      .eq("id", warrantyId)
      .select()
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
    console.error("Error in PATCH /api/warranties/[warrantyId]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
