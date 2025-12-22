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

// GET /api/labor-pool - List labor pool members
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);

    const url = new URL(req.url);
    const skill = url.searchParams.get("skill");
    const availability = url.searchParams.get("availability");
    const search = url.searchParams.get("search");
    const includeShared = url.searchParams.get("include_shared") === "true";
    const verifiedOnly = url.searchParams.get("verified_only") === "true";
    const city = url.searchParams.get("city");
    const state = url.searchParams.get("state");
    const radius = url.searchParams.get("radius"); // in miles
    const lat = url.searchParams.get("lat");
    const lng = url.searchParams.get("lng");

    // Build query
    let query = supabase
      .from("labor_pool")
      .select("*")
      .order("rating", { ascending: false })
      .order("created_at", { ascending: false });

    // Filter by org or include shared/network-wide
    if (includeShared) {
      query = query.or(`org_id.eq.${orgId},org_id.is.null,is_shared.eq.true`);
    } else if (orgId) {
      query = query.or(`org_id.eq.${orgId},org_id.is.null`);
    } else {
      query = query.is("org_id", null);
    }

    // Filter by skill
    if (skill) {
      query = query.eq("skill", skill);
    }

    // Filter by availability
    if (availability) {
      query = query.eq("availability", availability);
    } else {
      // Default to available/busy
      query = query.in("availability", ["available", "busy"]);
    }

    // Filter by verified
    if (verifiedOnly) {
      query = query.eq("verified", true);
    }

    // Filter by location
    if (city) {
      query = query.eq("city", city);
    }
    if (state) {
      query = query.eq("state", state);
    }

    // Search
    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Filter by status
    query = query.eq("status", "active");

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If lat/lng provided, calculate distance and filter by radius
    let results = data || [];
    if (lat && lng && radius) {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      const radiusNum = parseFloat(radius);

      results = results
        .filter((labor: any) => {
          if (!labor.latitude || !labor.longitude) return false;
          const distance = calculateDistance(
            latNum,
            lngNum,
            labor.latitude,
            labor.longitude
          );
          return distance <= radiusNum;
        })
        .map((labor: any) => {
          const distance = calculateDistance(
            latNum,
            lngNum,
            labor.latitude,
            labor.longitude
          );
          return { ...labor, distance_miles: Math.round(distance * 10) / 10 };
        })
        .sort((a: any, b: any) => a.distance_miles - b.distance_miles);
    }

    return NextResponse.json({ ok: true, labor: results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// POST /api/labor-pool - Add labor pool member
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);

    const body = await req.json();
    const {
      name,
      phone,
      email,
      skill,
      experience_years,
      certifications,
      city,
      state,
      zip_code,
      latitude,
      longitude,
      availability = "available",
      preferred_radius_miles = 25,
      insurance_provider,
      insurance_expires,
      verification_docs,
      notes,
      is_shared = false,
    } = body;

    if (!name || !phone || !skill) {
      return NextResponse.json(
        { error: "name, phone, and skill are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("labor_pool")
      .insert({
        org_id: orgId || null,
        name,
        phone,
        email: email || null,
        skill,
        experience_years: experience_years || 0,
        certifications: certifications || [],
        city: city || null,
        state: state || null,
        zip_code: zip_code || null,
        latitude: latitude || null,
        longitude: longitude || null,
        availability,
        preferred_radius_miles,
        insurance_provider: insurance_provider || null,
        insurance_expires: insurance_expires || null,
        verification_docs: verification_docs || [],
        notes: notes || null,
        is_shared: is_shared || false,
        status: "active",
        verified: false,
      })
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

// Helper function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}





















