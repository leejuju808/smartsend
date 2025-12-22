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

// GET /api/partner-jobs - List partner jobs
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
    const status = url.searchParams.get("status");
    const resourceType = url.searchParams.get("resource_type");
    const myRequests = url.searchParams.get("my_requests") === "true";
    const myOffers = url.searchParams.get("my_offers") === "true";
    const openOnly = url.searchParams.get("open_only") === "true";

    // Build query
    let query = supabase
      .from("partner_jobs")
      .select("*")
      .order("needed_on", { ascending: true })
      .order("created_at", { ascending: false });

    // Filter by requester or provider
    if (myRequests) {
      query = query.eq("requester_org_id", orgId);
    } else if (myOffers) {
      query = query.eq("provider_org_id", orgId);
    } else {
      // Show both requests and offers for this org
      query = query.or(`requester_org_id.eq.${orgId},provider_org_id.eq.${orgId}`);
    }

    // Filter by status
    if (status) {
      query = query.eq("status", status);
    } else if (openOnly) {
      query = query.eq("status", "open");
    }

    // Filter by resource type
    if (resourceType) {
      query = query.eq("resource_type", resourceType);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, jobs: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// POST /api/partner-jobs - Create partner job request
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
      job_description,
      resource_type,
      quantity_needed = 1,
      needed_on,
      needed_until,
      urgency = "normal",
      job_location,
      city,
      state,
      zip_code,
      budget_per_unit,
      total_budget,
      notes,
      is_shared = true,
    } = body;

    if (!job_description || !resource_type || !needed_on) {
      return NextResponse.json(
        { error: "job_description, resource_type, and needed_on are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("partner_jobs")
      .insert({
        requester_org_id: orgId,
        job_description,
        resource_type,
        quantity_needed,
        needed_on,
        needed_until: needed_until || null,
        urgency,
        job_location: job_location || null,
        city: city || null,
        state: state || null,
        zip_code: zip_code || null,
        budget_per_unit: budget_per_unit || null,
        total_budget: total_budget || null,
        notes: notes || null,
        is_shared: is_shared || true,
        status: "open",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, job: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}





















