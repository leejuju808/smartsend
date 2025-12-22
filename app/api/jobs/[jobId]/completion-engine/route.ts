// Block 25180 — SmartSend Roofing Job Completion Engine v1
// API Route: Completion Engine Status & Updates
// GET/POST /api/jobs/[jobId]/completion-engine

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: Get completion engine status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get completion tracking
    const { data: tracking, error: trackingError } = await supabase
      .from("job_completion_tracking")
      .select(`
        *,
        final_invoice:job_invoices!job_completion_tracking_final_invoice_id_fkey(
          id,
          amount,
          status,
          payment_link,
          due_date
        )
      `)
      .eq("job_id", jobId)
      .single();

    if (trackingError && trackingError.code !== "PGRST116") {
      console.error("Error fetching completion tracking:", trackingError);
      return NextResponse.json(
        { error: trackingError.message || "Failed to fetch completion tracking" },
        { status: 500 }
      );
    }

    // Get cleanup checklist
    const { data: cleanupChecklist } = await supabase
      .from("cleanup_confirmation_checklist")
      .select("*")
      .eq("job_id", jobId)
      .single();

    // Get required photos
    const { data: requiredPhotos } = await supabase
      .from("job_completion_photos")
      .select("*")
      .eq("job_id", jobId)
      .eq("is_required", true);

    // Get warranty package
    const { data: warranty } = await supabase
      .from("warranty_packages")
      .select("*")
      .eq("job_id", jobId)
      .single();

    // Get review tracking
    const { data: review } = await supabase
      .from("review_tracking")
      .select("*")
      .eq("job_id", jobId)
      .single();

    // Get referral tracking
    const { data: referral } = await supabase
      .from("referral_tracking")
      .select("*")
      .eq("job_id", jobId)
      .single();

    // Get timeline events
    const { data: timelineEvents } = await supabase
      .from("completion_timeline_events")
      .select("*")
      .eq("job_id", jobId)
      .order("occurred_at", { ascending: false })
      .limit(20);

    return NextResponse.json(
      {
        tracking: tracking || null,
        cleanupChecklist: cleanupChecklist || null,
        requiredPhotos: requiredPhotos || [],
        warranty: warranty || null,
        review: review || null,
        referral: referral || null,
        timelineEvents: timelineEvents || [],
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error fetching completion engine status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Update completion status
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { action, data: updateData } = body;

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    let result: any = {};

    switch (action) {
      case "mark_install_complete":
        // Update completion tracking
        const { data: tracking } = await supabase
          .from("job_completion_tracking")
          .upsert({
            job_id: jobId,
            workspace_id: job.workspace_id,
            install_completed_at: new Date().toISOString(),
            install_completed_by: user.id,
            completion_status: "install_complete",
          }, {
            onConflict: "job_id",
          })
          .select()
          .single();

        // Trigger completion workflow
        await supabase.rpc("trigger_completion_workflow_on_install");

        result = { tracking };
        break;

      case "update_cleanup_checklist":
        const { data: cleanupUpdate } = await supabase
          .from("cleanup_confirmation_checklist")
          .upsert({
            job_id: jobId,
            workspace_id: job.workspace_id,
            ...updateData,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "job_id",
          })
          .select()
          .single();

        // Update completion tracking
        await supabase
          .from("job_completion_tracking")
          .update({
            cleanup_completed_at: updateData.status === "crew_complete" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("job_id", jobId);

        result = { cleanupChecklist: cleanupUpdate };
        break;

      case "confirm_homeowner_cleanup":
        const { data: homeownerConfirm } = await supabase
          .from("cleanup_confirmation_checklist")
          .update({
            homeowner_confirmed: true,
            homeowner_confirmed_at: new Date().toISOString(),
            status: updateData.has_issues ? "issues_reported" : "homeowner_confirmed",
            homeowner_notes: updateData.notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq("job_id", jobId)
          .select()
          .single();

        // Update completion tracking
        await supabase
          .from("job_completion_tracking")
          .update({
            homeowner_cleanup_confirmed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("job_id", jobId);

        result = { cleanupChecklist: homeownerConfirm };
        break;

      case "mark_photos_uploaded":
        const { photoIds } = updateData;
        
        if (photoIds && photoIds.length > 0) {
          await supabase
            .from("job_completion_photos")
            .update({
              is_uploaded: true,
              uploaded_at: new Date().toISOString(),
              uploaded_by: user.id,
            })
            .in("id", photoIds);
        }

        // Update completion tracking
        const { data: photoCount } = await supabase
          .from("job_completion_photos")
          .select("id", { count: "exact", head: true })
          .eq("job_id", jobId)
          .eq("is_uploaded", true);

        await supabase
          .from("job_completion_tracking")
          .update({
            photos_uploaded_at: new Date().toISOString(),
            photos_uploaded_count: photoCount?.length || 0,
            updated_at: new Date().toISOString(),
          })
          .eq("job_id", jobId);

        result = { success: true, photosUploaded: photoIds?.length || 0 };
        break;

      case "mark_final_invoice_paid":
        await supabase
          .from("job_completion_tracking")
          .update({
            final_invoice_paid_at: new Date().toISOString(),
            completion_status: "payment_pending",
            updated_at: new Date().toISOString(),
          })
          .eq("job_id", jobId);

        // Trigger comprehensive warranty generation (Block 25540)
        await supabase.rpc("generate_comprehensive_warranty_package", { p_job_id: jobId });
        await supabase.rpc("request_review_automation", { p_job_id: jobId });

        result = { success: true };
        break;

      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 }
        );
    }

    // Update overall completion status
    await supabase.rpc("update_completion_status", { p_job_id: jobId });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Error updating completion status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

