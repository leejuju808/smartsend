// GET /api/materials/items?job_id=xxx - List material items for a job
// POST /api/materials/items - Create material item

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
      .from("material_items")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching material items:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/materials/items:", error);
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
    const { job_id, name, quantity_expected, unit } = body;

    if (!job_id || !name || quantity_expected === undefined) {
      return NextResponse.json(
        { error: "job_id, name, and quantity_expected are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("material_items")
      .insert({
        job_id,
        name,
        quantity_expected,
        unit: unit || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating material item:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/materials/items:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























