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

// GET /api/vendors/pricing/compare - Compare pricing across vendors
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const url = new URL(req.url);
    const materialName = url.searchParams.get("material_name");
    const materialCategory = url.searchParams.get("material_category");
    const includeShared = url.searchParams.get("include_shared") === "true";

    if (!materialName && !materialCategory) {
      return NextResponse.json(
        { error: "material_name or material_category is required" },
        { status: 400 }
      );
    }

    // Get accessible vendors (own + shared)
    let vendorQuery = supabase
      .from("vendor_partners")
      .select("id, vendor_name, rating")
      .eq("status", "active");

    if (includeShared) {
      vendorQuery = vendorQuery.or(`org_id.eq.${orgId},is_shared.eq.true`);
    } else {
      vendorQuery = vendorQuery.eq("org_id", orgId);
    }

    const { data: vendors } = await vendorQuery;

    if (!vendors || vendors.length === 0) {
      return NextResponse.json({ ok: true, comparisons: [] });
    }

    const vendorIds = vendors.map((v: any) => v.id);

    // Get pricing for all vendors
    let pricingQuery = supabase
      .from("vendor_pricing")
      .select("*")
      .in("vendor_id", vendorIds)
      .or(
        `price_valid_until.is.null,price_valid_until.gte.${new Date().toISOString().split("T")[0]}`
      );

    if (materialName) {
      pricingQuery = pricingQuery.ilike("material_name", `%${materialName}%`);
    }

    if (materialCategory) {
      pricingQuery = pricingQuery.eq("material_category", materialCategory);
    }

    const { data: pricing, error } = await pricingQuery.order("price", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by material name and compare
    const comparisons: any = {};
    const vendorMap = new Map(vendors.map((v: any) => [v.id, v]));

    (pricing || []).forEach((p: any) => {
      const key = p.material_name.toLowerCase().trim();
      if (!comparisons[key]) {
        comparisons[key] = {
          material_name: p.material_name,
          material_category: p.material_category,
          unit: p.unit,
          vendors: [],
        };
      }

      const vendor = vendorMap.get(p.vendor_id);
      comparisons[key].vendors.push({
        vendor_id: p.vendor_id,
        vendor_name: vendor?.vendor_name || "Unknown",
        vendor_rating: vendor?.rating || 0,
        price: p.price,
        unit: p.unit,
        in_stock: p.in_stock,
        lead_time_days: p.lead_time_days,
        bulk_discount_threshold: p.bulk_discount_threshold,
        bulk_discount_percent: p.bulk_discount_percent,
        pricing_id: p.id,
      });
    });

    // Sort vendors by price within each material
    Object.keys(comparisons).forEach((key) => {
      comparisons[key].vendors.sort((a: any, b: any) => a.price - b.price);
      comparisons[key].lowest_price = comparisons[key].vendors[0]?.price || null;
      comparisons[key].highest_price =
        comparisons[key].vendors[comparisons[key].vendors.length - 1]?.price || null;
    });

    // Convert to array and sort by material name
    const result = Object.values(comparisons).sort((a: any, b: any) =>
      a.material_name.localeCompare(b.material_name)
    );

    return NextResponse.json({ ok: true, comparisons: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}





















