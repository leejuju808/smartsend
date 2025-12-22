// Block 25980 — Production Calendar Job Readiness API
// GET /api/production-calendar/readiness?job_id=... - Get readiness checklist
// PUT /api/production-calendar/readiness - Update readiness checklist

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

// GET readiness checklist
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const searchParams = req.nextUrl.searchParams;
    const jobId = searchParams.get("job_id");

    if (!jobId) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get or create checklist
    let { data: checklist, error: checklistError } = await supabase
      .from("job_readiness_checklist")
      .select("*")
      .eq("job_id", jobId)
      .eq("workspace_id", workspaceId)
      .single();

    if (checklistError && checklistError.code === "PGRST116") {
      // Checklist doesn't exist, create it
      const { data: job } = await supabase
        .from("roofing_jobs")
        .select("workspace_id")
        .eq("id", jobId)
        .single();

      if (!job) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      const { data: newChecklist, error: createError } = await supabase
        .from("job_readiness_checklist")
        .insert({
          workspace_id: job.workspace_id,
          job_id: jobId,
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating checklist:", createError);
        return NextResponse.json(
          { error: createError.message },
          { status: 500 }
        );
      }

      checklist = newChecklist;
    } else if (checklistError) {
      console.error("Error fetching checklist:", checklistError);
      return NextResponse.json(
        { error: checklistError.message },
        { status: 500 }
      );
    }

    // Calculate readiness score
    const score = await supabase.rpc("calculate_job_readiness_score", {
      p_job_id: jobId,
    });

    // Refresh checklist
    const { data: updatedChecklist } = await supabase
      .from("job_readiness_checklist")
      .select("*")
      .eq("job_id", jobId)
      .single();

    return NextResponse.json({
      checklist: updatedChecklist || checklist,
      readiness_score: score.data || 0,
    });
  } catch (error: any) {
    console.error("Error in readiness API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT update readiness checklist
export async function PUT(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const body = await req.json();
    const {
      job_id,
      inspection_completed,
      quote_approved,
      contract_signed,
      deposit_received,
      materials_ordered,
      insurance_docs_uploaded,
      hoa_approval_received,
      hoa_approval_required,
      notes,
    } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get or create checklist
    let { data: checklist } = await supabase
      .from("job_readiness_checklist")
      .select("*")
      .eq("job_id", job_id)
      .eq("workspace_id", workspaceId)
      .single();

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (inspection_completed !== undefined) updateData.inspection_completed = inspection_completed;
    if (quote_approved !== undefined) updateData.quote_approved = quote_approved;
    if (contract_signed !== undefined) updateData.contract_signed = contract_signed;
    if (deposit_received !== undefined) updateData.deposit_received = deposit_received;
    if (materials_ordered !== undefined) updateData.materials_ordered = materials_ordered;
    if (insurance_docs_uploaded !== undefined) updateData.insurance_docs_uploaded = insurance_docs_uploaded;
    if (hoa_approval_received !== undefined) updateData.hoa_approval_received = hoa_approval_received;
    if (hoa_approval_required !== undefined) updateData.hoa_approval_required = hoa_approval_required;
    if (notes !== undefined) updateData.notes = notes;

    if (!checklist) {
      // Create new checklist
      const { data: job } = await supabase
        .from("roofing_jobs")
        .select("workspace_id")
        .eq("id", job_id)
        .single();

      if (!job) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      const { data: newChecklist, error: createError } = await supabase
        .from("job_readiness_checklist")
        .insert({
          workspace_id: job.workspace_id,
          job_id,
          ...updateData,
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating checklist:", createError);
        return NextResponse.json(
          { error: createError.message },
          { status: 500 }
        );
      }

      checklist = newChecklist;
    } else {
      // Update existing checklist
      const { data: updatedChecklist, error: updateError } = await supabase
        .from("job_readiness_checklist")
        .update(updateData)
        .eq("id", checklist.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating checklist:", updateError);
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        );
      }

      checklist = updatedChecklist;
    }

    // Recalculate readiness score (trigger will handle this, but call explicitly)
    await supabase.rpc("calculate_job_readiness_score", {
      p_job_id: job_id,
    });

    // Refresh checklist
    const { data: finalChecklist } = await supabase
      .from("job_readiness_checklist")
      .select("*")
      .eq("job_id", job_id)
      .single();

    return NextResponse.json({
      checklist: finalChecklist,
      message: "Readiness checklist updated",
    });
  } catch (error: any) {
    console.error("Error updating readiness checklist:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































