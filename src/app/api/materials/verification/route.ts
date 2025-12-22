// GET /api/materials/verification?job_id=xxx - Get verification records for a job
// POST /api/materials/verification - Create/update verification record

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const jobId = searchParams.get("job_id");

    if (!jobId) {
      return NextResponse.json({ error: "job_id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("material_verification")
      .select(`
        *,
        material_items:material_item_id (
          id,
          name,
          quantity_expected,
          unit
        ),
        workforce_employees:verified_by (
          id,
          first_name,
          last_name
        )
      `)
      .eq("job_id", jobId)
      .order("verified_at", { ascending: false });

    if (error) {
      console.error("Error fetching verification records:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ verifications: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/materials/verification:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, material_item_id, quantity_found, verified_by, photo_url, notes } = body;

    if (!job_id || !material_item_id || quantity_found === undefined) {
      return NextResponse.json(
        { error: "job_id, material_item_id, and quantity_found are required" },
        { status: 400 }
      );
    }

    // Get expected quantity to auto-evaluate status
    const { data: materialItem } = await supabase
      .from("material_items")
      .select("quantity_expected, name")
      .eq("id", material_item_id)
      .single();

    if (!materialItem) {
      return NextResponse.json({ error: "Material item not found" }, { status: 404 });
    }

    // Auto-evaluate status
    let status = "pending";
    if (quantity_found === materialItem.quantity_expected) {
      status = "matched";
    } else if (quantity_found < materialItem.quantity_expected) {
      status = "shortage";
    } else {
      status = "extra";
    }

    // Check if verification already exists
    const { data: existing } = await supabase
      .from("material_verification")
      .select("id")
      .eq("job_id", job_id)
      .eq("material_item_id", material_item_id)
      .single();

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from("material_verification")
        .update({
          quantity_found,
          verified_by: verified_by || null,
          status,
          photo_url: photo_url || null,
          notes: notes || null,
          verified_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from("material_verification")
        .insert({
          job_id,
          material_item_id,
          quantity_found,
          verified_by: verified_by || null,
          status,
          photo_url: photo_url || null,
          notes: notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ verification: result }, { status: existing ? 200 : 201 });
  } catch (error: any) {
    console.error("Error in POST /api/materials/verification:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























