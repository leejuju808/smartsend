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

// GET /api/vendors/[id]/pricing - Get vendor pricing
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
    const url = new URL(req.url);
    const materialName = url.searchParams.get("material_name");
    const materialCategory = url.searchParams.get("material_category");
    const validOnly = url.searchParams.get("valid_only") !== "false"; // default true

    // Verify vendor access
    const { data: vendor } = await supabase
      .from("vendor_partners")
      .select("id, org_id, is_shared, status")
      .eq("id", vendorId)
      .single();

    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    // Build pricing query
    let query = supabase
      .from("vendor_pricing")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("material_name", { ascending: true })
      .order("updated_at", { ascending: false });

    // Filter by material name
    if (materialName) {
      query = query.ilike("material_name", `%${materialName}%`);
    }

    // Filter by category
    if (materialCategory) {
      query = query.eq("material_category", materialCategory);
    }

    // Filter by validity
    if (validOnly) {
      query = query.or(
        `price_valid_until.is.null,price_valid_until.gte.${new Date().toISOString().split("T")[0]}`
      );
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, pricing: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// POST /api/vendors/[id]/pricing - Add vendor pricing
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

    // Verify vendor ownership
    const { data: vendor } = await supabase
      .from("vendor_partners")
      .select("id, org_id")
      .eq("id", vendorId)
      .single();

    if (!vendor || vendor.org_id !== orgId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const {
      material_name,
      material_sku,
      material_category,
      price,
      unit,
      min_quantity = 1,
      bulk_discount_threshold,
      bulk_discount_percent,
      in_stock = true,
      lead_time_days = 0,
      price_valid_from,
      price_valid_until,
      notes,
    } = body;

    if (!material_name || !price || !unit) {
      return NextResponse.json(
        { error: "material_name, price, and unit are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("vendor_pricing")
      .insert({
        vendor_id: vendorId,
        material_name,
        material_sku: material_sku || null,
        material_category: material_category || null,
        price,
        unit,
        min_quantity,
        bulk_discount_threshold: bulk_discount_threshold || null,
        bulk_discount_percent: bulk_discount_percent || null,
        in_stock,
        lead_time_days,
        price_valid_from: price_valid_from || new Date().toISOString().split("T")[0],
        price_valid_until: price_valid_until || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, pricing: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}





















