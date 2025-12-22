// Block 34044 — Material Verification API
// GET: Get material verification status
// POST: Update material verification

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

    const { data: verification, error } = await supabase
      .from("material_verification")
      .select(`
        *,
        crews (
          id,
          name
        )
      `)
      .eq("job_id", params.id)
      .order("verified_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ verification: verification || null });
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
      crew_id,
      material_arrived,
      material_arrived_at,
      bundle_count,
      access_issues = [],
      verification_photo_url,
      notes,
    } = body;

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

    // Upsert material verification
    const { data: verification, error } = await supabase
      .from("material_verification")
      .upsert({
        job_id: params.id,
        crew_id,
        material_arrived: material_arrived ?? false,
        material_arrived_at: material_arrived ? (material_arrived_at || new Date().toISOString()) : null,
        bundle_count,
        access_issues: Array.isArray(access_issues) ? access_issues : [],
        verification_photo_url,
        notes,
        verified_at: new Date().toISOString(),
      }, {
        onConflict: 'job_id',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ verification }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

































