// GET /api/workforce/subs/[id]/performance - List performance reviews
// POST /api/workforce/subs/[id]/performance - Create performance review

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

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

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { id } = await params;

    // Verify subcontractor belongs to company
    const { data: sub } = await supabase
      .from("subcontractors")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!sub) {
      return NextResponse.json({ error: "Subcontractor not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("sub_performance_reviews")
      .select(`
        *,
        jobs:job_id (
          id,
          homeowner_name,
          address
        )
      `)
      .eq("sub_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching performance reviews:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate average ratings
    let avgSpeed = 0;
    let avgQuality = 0;
    let avgProfessionalism = 0;
    let overallScore = 0;

    if (data && data.length > 0) {
      avgSpeed = data.reduce((sum, r) => sum + (r.rating_speed || 0), 0) / data.length;
      avgQuality = data.reduce((sum, r) => sum + (r.rating_quality || 0), 0) / data.length;
      avgProfessionalism =
        data.reduce((sum, r) => sum + (r.rating_professionalism || 0), 0) / data.length;
      overallScore = (avgSpeed + avgQuality + avgProfessionalism) / 3;
    }

    return NextResponse.json({
      reviews: data || [],
      averages: {
        speed: Math.round(avgSpeed * 10) / 10,
        quality: Math.round(avgQuality * 10) / 10,
        professionalism: Math.round(avgProfessionalism * 10) / 10,
        overall: Math.round(overallScore * 10) / 10,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/subs/[id]/performance:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { id } = await params;
    const body = await req.json();
    const { job_id, rating_speed, rating_quality, rating_professionalism, notes } = body;

    if (!rating_speed || !rating_quality || !rating_professionalism) {
      return NextResponse.json(
        { error: "rating_speed, rating_quality, and rating_professionalism are required" },
        { status: 400 }
      );
    }

    // Verify ratings are 1-5
    if (
      rating_speed < 1 ||
      rating_speed > 5 ||
      rating_quality < 1 ||
      rating_quality > 5 ||
      rating_professionalism < 1 ||
      rating_professionalism > 5
    ) {
      return NextResponse.json({ error: "Ratings must be between 1 and 5" }, { status: 400 });
    }

    // Verify subcontractor belongs to company
    const { data: sub } = await supabase
      .from("subcontractors")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!sub) {
      return NextResponse.json({ error: "Subcontractor not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("sub_performance_reviews")
      .insert({
        sub_id: id,
        job_id: job_id || null,
        rating_speed: parseInt(rating_speed),
        rating_quality: parseInt(rating_quality),
        rating_professionalism: parseInt(rating_professionalism),
        notes: notes || null,
        created_by: user.id,
      })
      .select(`
        *,
        jobs:job_id (
          id,
          homeowner_name,
          address
        )
      `)
      .single();

    if (error) {
      console.error("Error creating performance review:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ review: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/subs/[id]/performance:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























