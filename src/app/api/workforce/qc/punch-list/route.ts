// GET /api/workforce/qc/punch-list - List punch list items
// POST /api/workforce/qc/punch-list - Create punch list item

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
    const status = searchParams.get("status");

    let query = supabase
      .from("qc_punch_list")
      .select(`
        *,
        assigned_employee:assigned_to (
          id,
          first_name,
          last_name,
          role
        )
      `)
      .order("created_at", { ascending: false });

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching punch list:", error);
      return NextResponse.json(
        { error: "Failed to fetch punch list" },
        { status: 500 }
      );
    }

    return NextResponse.json({ items: data || [] });
  } catch (error) {
    console.error("Error in punch list GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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
    const { job_id, inspection_id, inspection_item_id, description, assigned_to } = body;

    if (!job_id || !description) {
      return NextResponse.json(
        { error: "Missing required fields: job_id, description" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("qc_punch_list")
      .insert({
        job_id,
        inspection_id: inspection_id || null,
        inspection_item_id: inspection_item_id || null,
        description,
        assigned_to: assigned_to || null,
        status: "open",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating punch list item:", error);
      return NextResponse.json(
        { error: "Failed to create punch list item" },
        { status: 500 }
      );
    }

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    console.error("Error in punch list POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
























