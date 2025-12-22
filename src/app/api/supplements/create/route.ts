// Block 228000 — Create Insurance Supplement
// POST /api/supplements/create
// Creates an insurance supplement draft

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { job_id, reason, description, items, crew_issue_id, adjuster_email, adjuster_name, adjuster_phone } = await req.json();

    if (!job_id || !reason || !description) {
      return NextResponse.json(
        { error: "job_id, reason, and description are required" },
        { status: 400 }
      );
    }

    // Verify job exists and get workspace_id
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, workspace_id, insurance")
      .eq("id", job_id)
      .single();

    let workspace_id: string;
    let isInsuranceJob = false;

    if (jobError || !job) {
      // Try roofing_jobs table
      const { data: roofingJob, error: roofingJobError } = await supabase
        .from("roofing_jobs")
        .select("id, workspace_id, insurance_claim")
        .eq("id", job_id)
        .single();

      if (roofingJobError || !roofingJob) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      workspace_id = roofingJob.workspace_id;
      isInsuranceJob = roofingJob.insurance_claim || false;
    } else {
      workspace_id = job.workspace_id;
      isInsuranceJob = job.insurance || false;
    }

    // Verify user has access to workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Calculate requested amount from items
    const requested_amount = items?.reduce((sum: number, item: any) => {
      return sum + (Number(item.qty || 1) * Number(item.unit_price || 0));
    }, 0) || 0;

    // Create supplement
    const { data: supplement, error: supplementError } = await supabase
      .from("insurance_supplements")
      .insert({
        job_id,
        workspace_id,
        created_by: user.id,
        reason,
        description,
        requested_amount,
        crew_issue_id: crew_issue_id || null,
        adjuster_email: adjuster_email || null,
        adjuster_name: adjuster_name || null,
        adjuster_phone: adjuster_phone || null,
        status: "draft",
      })
      .select()
      .single();

    if (supplementError || !supplement) {
      console.error("Error creating supplement:", supplementError);
      return NextResponse.json(
        { error: "Failed to create supplement" },
        { status: 500 }
      );
    }

    // Create line items if provided
    if (items && Array.isArray(items) && items.length > 0) {
      const lineItems = items.map((item: any) => ({
        supplement_id: supplement.id,
        xactimate_code: item.xactimate_code || null,
        description: item.description || item.label,
        qty: Number(item.qty || 1),
        unit_price: Number(item.unit_price || 0),
      }));

      const { error: itemsError } = await supabase
        .from("supplement_items")
        .insert(lineItems);

      if (itemsError) {
        console.error("Error creating supplement items:", itemsError);
        // Continue anyway, items can be added later
      }
    }

    // Get full supplement with items
    const { data: fullSupplement, error: fetchError } = await supabase
      .from("insurance_supplements")
      .select(`
        *,
        supplement_items (*)
      `)
      .eq("id", supplement.id)
      .single();

    return NextResponse.json({
      success: true,
      supplement_id: supplement.id,
      supplement: fullSupplement,
    });
  } catch (error: any) {
    console.error("Error creating supplement:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create supplement" },
      { status: 500 }
    );
  }
}

























