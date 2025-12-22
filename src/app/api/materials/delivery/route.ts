// GET /api/materials/delivery?job_id=xxx - Get delivery records for a job
// POST /api/materials/delivery - Create delivery record

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
      .from("material_delivery_records")
      .select(`
        *,
        workforce_employees:employee_id (
          id,
          first_name,
          last_name
        )
      `)
      .eq("job_id", jobId)
      .order("delivered_at", { ascending: false });

    if (error) {
      console.error("Error fetching delivery records:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ records: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/materials/delivery:", error);
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
    const { job_id, supplier, employee_id, photo_url, notes } = body;

    if (!job_id) {
      return NextResponse.json({ error: "job_id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("material_delivery_records")
      .insert({
        job_id,
        supplier: supplier || null,
        employee_id: employee_id || null,
        photo_url: photo_url || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating delivery record:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ record: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/materials/delivery:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























