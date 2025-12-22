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

// POST /api/vendors/[id]/reviews - Create or update vendor review
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

    const { id: vendorId } = await params;
    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Verify vendor exists and is accessible
    const { data: vendor } = await supabase
      .from("vendor_partners")
      .select("id, org_id, is_shared, status")
      .eq("id", vendorId)
      .single();

    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    // Check access
    if (vendor.org_id !== orgId && (!vendor.is_shared || vendor.status !== "active")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const {
      overall_rating,
      responsiveness_rating,
      accuracy_rating,
      speed_rating,
      quality_rating,
      pricing_rating,
      review_text,
      job_id,
    } = body;

    if (!overall_rating || overall_rating < 1 || overall_rating > 5) {
      return NextResponse.json(
        { error: "overall_rating is required and must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Upsert review (one per org per vendor)
    const { data, error } = await supabase
      .from("vendor_reviews")
      .upsert(
        {
          vendor_id: vendorId,
          org_id: orgId,
          user_id: user.id,
          overall_rating,
          responsiveness_rating: responsiveness_rating || null,
          accuracy_rating: accuracy_rating || null,
          speed_rating: speed_rating || null,
          quality_rating: quality_rating || null,
          pricing_rating: pricing_rating || null,
          review_text: review_text || null,
          job_id: job_id || null,
          status: "published",
        },
        {
          onConflict: "vendor_id,org_id",
        }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Trigger rating recalculation (handled by database trigger)
    // The trigger will automatically call calculate_vendor_rating

    return NextResponse.json({ ok: true, review: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// GET /api/vendors/[id]/reviews - Get vendor reviews
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

    const { id: vendorId } = await params;

    const { data, error } = await supabase
      .from("vendor_reviews")
      .select("*")
      .eq("vendor_id", vendorId)
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





















