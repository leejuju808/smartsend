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

// GET /api/labor-pool/[id] - Get labor details
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

    const { id } = await params;
    const orgId = await getCurrentOrgId(supabase, user.id);

    const { data, error } = await supabase
      .from("labor_pool")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Labor not found" }, { status: 404 });
    }

    // Check access (must be owner, shared, or network-wide)
    if (data.org_id && data.org_id !== orgId && (!data.is_shared || data.status !== "active")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get reviews
    const { data: reviews } = await supabase
      .from("labor_reviews")
      .select("*")
      .eq("labor_id", id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      ok: true,
      labor: data,
      reviews: reviews || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/labor-pool/[id] - Update labor
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const orgId = await getCurrentOrgId(supabase, user.id);

    // Verify ownership or network-wide access
    const { data: existing } = await supabase
      .from("labor_pool")
      .select("org_id")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Labor not found" }, { status: 404 });
    }

    // Can update if owner, or if network-wide (org_id is null)
    if (existing.org_id && existing.org_id !== orgId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const {
      name,
      phone,
      email,
      skill,
      experience_years,
      certifications,
      availability,
      city,
      state,
      zip_code,
      latitude,
      longitude,
      preferred_radius_miles,
      insurance_provider,
      insurance_expires,
      verification_docs,
      verified,
      notes,
      is_shared,
      status,
    } = body;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (email !== undefined) updates.email = email;
    if (skill !== undefined) updates.skill = skill;
    if (experience_years !== undefined) updates.experience_years = experience_years;
    if (certifications !== undefined) updates.certifications = certifications;
    if (availability !== undefined) updates.availability = availability;
    if (city !== undefined) updates.city = city;
    if (state !== undefined) updates.state = state;
    if (zip_code !== undefined) updates.zip_code = zip_code;
    if (latitude !== undefined) updates.latitude = latitude;
    if (longitude !== undefined) updates.longitude = longitude;
    if (preferred_radius_miles !== undefined) updates.preferred_radius_miles = preferred_radius_miles;
    if (insurance_provider !== undefined) updates.insurance_provider = insurance_provider;
    if (insurance_expires !== undefined) updates.insurance_expires = insurance_expires;
    if (verification_docs !== undefined) updates.verification_docs = verification_docs;
    if (verified !== undefined) updates.verified = verified;
    if (notes !== undefined) updates.notes = notes;
    if (is_shared !== undefined) updates.is_shared = is_shared;
    if (status !== undefined) updates.status = status;

    const { data, error } = await supabase
      .from("labor_pool")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, labor: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/labor-pool/[id] - Delete labor
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const orgId = await getCurrentOrgId(supabase, user.id);

    // Verify ownership
    const { data: existing } = await supabase
      .from("labor_pool")
      .select("org_id")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Labor not found" }, { status: 404 });
    }

    // Can delete if owner, or if network-wide (org_id is null)
    if (existing.org_id && existing.org_id !== orgId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { error } = await supabase
      .from("labor_pool")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}





















