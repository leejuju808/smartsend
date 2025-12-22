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

// GET /api/partner-jobs/[id] - Get partner job details
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
      .from("partner_jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Check access (must be requester or provider, or open job)
    if (
      data.requester_org_id !== orgId &&
      data.provider_org_id !== orgId &&
      (data.status !== "open" || !data.is_shared)
    ) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, job: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/partner-jobs/[id] - Update partner job
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

    // Verify access
    const { data: existing } = await supabase
      .from("partner_jobs")
      .select("requester_org_id, provider_org_id, status")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const body = await req.json();
    const { action, ...updates } = body;

    // Handle special actions
    if (action === "accept" && existing.status === "open") {
      // Provider accepts the job
      if (existing.requester_org_id === orgId) {
        return NextResponse.json({ error: "Cannot accept your own request" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("partner_jobs")
        .update({
          provider_org_id: orgId,
          status: "matched",
          matched_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, job: data });
    }

    if (action === "complete") {
      // Mark job as completed
      if (existing.requester_org_id !== orgId && existing.provider_org_id !== orgId) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      const { data, error } = await supabase
        .from("partner_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, job: data });
    }

    if (action === "cancel") {
      // Cancel job (only requester can cancel)
      if (existing.requester_org_id !== orgId) {
        return NextResponse.json({ error: "Only requester can cancel" }, { status: 403 });
      }

      const { data, error } = await supabase
        .from("partner_jobs")
        .update({
          status: "cancelled",
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, job: data });
    }

    // Regular update (only requester can update)
    if (existing.requester_org_id !== orgId) {
      return NextResponse.json({ error: "Only requester can update" }, { status: 403 });
    }

    const allowedUpdates: any = {};
    if (updates.job_description !== undefined) allowedUpdates.job_description = updates.job_description;
    if (updates.resource_type !== undefined) allowedUpdates.resource_type = updates.resource_type;
    if (updates.quantity_needed !== undefined) allowedUpdates.quantity_needed = updates.quantity_needed;
    if (updates.needed_on !== undefined) allowedUpdates.needed_on = updates.needed_on;
    if (updates.needed_until !== undefined) allowedUpdates.needed_until = updates.needed_until;
    if (updates.urgency !== undefined) allowedUpdates.urgency = updates.urgency;
    if (updates.job_location !== undefined) allowedUpdates.job_location = updates.job_location;
    if (updates.city !== undefined) allowedUpdates.city = updates.city;
    if (updates.state !== undefined) allowedUpdates.state = updates.state;
    if (updates.zip_code !== undefined) allowedUpdates.zip_code = updates.zip_code;
    if (updates.budget_per_unit !== undefined) allowedUpdates.budget_per_unit = updates.budget_per_unit;
    if (updates.total_budget !== undefined) allowedUpdates.total_budget = updates.total_budget;
    if (updates.notes !== undefined) allowedUpdates.notes = updates.notes;
    if (updates.is_shared !== undefined) allowedUpdates.is_shared = updates.is_shared;

    // Can only update if status is open
    if (existing.status !== "open") {
      return NextResponse.json({ error: "Can only update open jobs" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("partner_jobs")
      .update(allowedUpdates)
      .eq("id", id)
      .eq("requester_org_id", orgId)
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





















