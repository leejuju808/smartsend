import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// Helper to get current org_id
async function getCurrentOrgId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("current_org_id")?.value || cookieStore.get("org_id")?.value;
  
  if (orgId) return orgId;

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}

// POST /api/labor-pool/[id]/reviews - Create or update labor review
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: laborId } = await params;
    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Verify labor exists and is accessible
    const { data: labor } = await supabase
      .from("labor_pool")
      .select("id, org_id, is_shared, status")
      .eq("id", laborId)
      .single();

    if (!labor) {
      return NextResponse.json({ error: "Labor not found" }, { status: 404 });
    }

    // Check access
    if (labor.org_id && labor.org_id !== orgId && (!labor.is_shared || labor.status !== "active")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const {
      overall_rating,
      skill_rating,
      reliability_rating,
      communication_rating,
      review_text,
      job_id,
    } = body;

    if (!overall_rating || overall_rating < 1 || overall_rating > 5) {
      return NextResponse.json(
        { error: "overall_rating is required and must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Upsert review (one per org per labor)
    const { data, error } = await supabase
      .from("labor_reviews")
      .upsert(
        {
          labor_id: laborId,
          org_id: orgId,
          user_id: user.id,
          overall_rating,
          skill_rating: skill_rating || null,
          reliability_rating: reliability_rating || null,
          communication_rating: communication_rating || null,
          review_text: review_text || null,
          job_id: job_id || null,
          status: "published",
        },
        {
          onConflict: "labor_id,org_id",
        }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Trigger rating recalculation (handled by database trigger)

    return NextResponse.json({ ok: true, review: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// GET /api/labor-pool/[id]/reviews - Get labor reviews
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: laborId } = await params;

    const { data, error } = await supabase
      .from("labor_reviews")
      .select("*")
      .eq("labor_id", laborId)
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, reviews: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}





















