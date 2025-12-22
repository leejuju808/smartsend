// Block 34044 — Progress Photos API
// GET: List photos for a job
// POST: Upload photo metadata (actual upload handled separately via storage)

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(req.url);
    const category = url.searchParams.get("category");

    let query = supabase
      .from("job_progress_photos")
      .select(`
        *,
        crews (
          id,
          name
        )
      `)
      .eq("job_id", params.id);

    if (category) {
      query = query.eq("category", category);
    }

    const { data: photos, error } = await query.order("uploaded_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ photos: photos || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      photo_url,
      category,
      description,
      crew_id,
    } = body;

    if (!photo_url || !category) {
      return NextResponse.json(
        { error: "photo_url and category are required" },
        { status: 400 }
      );
    }

    const validCategories = ['before', 'during', 'after', 'issue', 'material', 'access'];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify job exists
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", params.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Create photo record
    const { data: photo, error } = await supabase
      .from("job_progress_photos")
      .insert({
        job_id: params.id,
        crew_id,
        photo_url,
        category,
        description,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ photo }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

































