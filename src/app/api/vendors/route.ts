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

// GET /api/vendors - List vendors
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
    const trade = url.searchParams.get("trade");
    const search = url.searchParams.get("search");
    const includeShared = url.searchParams.get("include_shared") === "true";
    const status = url.searchParams.get("status") || "active";

    // Build query
    let query = supabase
      .from("vendor_partners")
      .select("*")
      .order("rating", { ascending: false })
      .order("created_at", { ascending: false });

    // Filter by org or include shared
    if (includeShared) {
      query = query.or(`org_id.eq.${orgId},is_shared.eq.true`);
    } else {
      query = query.eq("org_id", orgId);
    }

    // Filter by trade
    if (trade) {
      query = query.eq("trade", trade);
    }

    // Filter by status
    if (status) {
      query = query.eq("status", status);
    }

    // Search
    if (search) {
      query = query.or(`vendor_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, vendors: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// POST /api/vendors - Create vendor
export async function POST(req: NextRequest) {
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
      is_shared = false,
    } = body;

    if (!vendor_name || !trade) {
      return NextResponse.json({ error: "vendor_name and trade are required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("vendor_partners")
      .insert({
        org_id: orgId,
        vendor_name,
        trade,
        phone: phone || null,
        email: email || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zip_code: zip_code || null,
        website: website || null,
        notes: notes || null,
        is_shared: is_shared || false,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Vendor with this name and trade already exists" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, vendor: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}





















