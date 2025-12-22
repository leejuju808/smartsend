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

// POST /api/partner-jobs/[id]/feedback - Submit feedback/rating
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

    const { id } = await params;
    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Verify access
    const { data: job } = await supabase
      .from("partner_jobs")
      .select("requester_org_id, provider_org_id, status")
      .eq("id", id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "completed") {
      return NextResponse.json({ error: "Can only rate completed jobs" }, { status: 400 });
    }

    const body = await req.json();
    const { rating, feedback, is_requester } = body;

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "rating is required and must be between 1 and 5" },
        { status: 400 }
      );
    }

    const updates: any = {};
    if (is_requester) {
      // Requester rating provider
      if (job.requester_org_id !== orgId) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      updates.requester_rating = rating;
      updates.requester_feedback = feedback || null;
    } else {
      // Provider rating requester
      if (job.provider_org_id !== orgId) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      updates.provider_rating = rating;
      updates.provider_feedback = feedback || null;
    }

    const { data, error } = await supabase
      .from("partner_jobs")
      .update(updates)
      .eq("id", id)
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





















