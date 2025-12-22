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

// GET /api/vendors/[id] - Get vendor details
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
      .from("vendor_partners")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    // Check access (must be owner or shared)
    if (data.org_id !== orgId && (!data.is_shared || data.status !== "active")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get reviews
    const { data: reviews } = await supabase
      .from("vendor_reviews")
      .select("*")
      .eq("vendor_id", id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      ok: true,
      vendor: data,
      reviews: reviews || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/vendors/[id] - Update vendor
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
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from("vendor_partners")
      .select("org_id")
      .eq("id", id)
      .single();

    if (!existing || existing.org_id !== orgId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const {
      vendor_name,
      trade,
      phone,
      email,
      address,
      city,
      state,
      zip_code,
      website,
      notes,
      is_shared,
      status,
    } = body;

    const updates: any = {};
    if (vendor_name !== undefined) updates.vendor_name = vendor_name;
    if (trade !== undefined) updates.trade = trade;
    if (phone !== undefined) updates.phone = phone;
    if (email !== undefined) updates.email = email;
    if (address !== undefined) updates.address = address;
    if (city !== undefined) updates.city = city;
    if (state !== undefined) updates.state = state;
    if (zip_code !== undefined) updates.zip_code = zip_code;
    if (website !== undefined) updates.website = website;
    if (notes !== undefined) updates.notes = notes;
    if (is_shared !== undefined) updates.is_shared = is_shared;
    if (status !== undefined) updates.status = status;

    const { data, error } = await supabase
      .from("vendor_partners")
      .update(updates)
      .eq("id", id)
      .eq("org_id", orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, vendor: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/vendors/[id] - Delete vendor
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
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from("vendor_partners")
      .select("org_id")
      .eq("id", id)
      .single();

    if (!existing || existing.org_id !== orgId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { error } = await supabase
      .from("vendor_partners")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}





















