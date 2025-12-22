import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id from workspace_members
  const { data: membership, error: memError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;

  try {
    const body = await req.json();
    const {
      job_id,
      category,
      amount,
      description,
      vendor,
      cost_date,
      reference_id,
      reference_type,
    } = body;

    if (!job_id || !category || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: job_id, category, amount" },
        { status: 400 }
      );
    }

    // Get job (and verify it belongs to workspace)
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", job_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Insert cost entry
    const { error: insertError } = await supabase
      .from("job_cost_entries")
      .insert({
        job_id,
        workspace_id: workspaceId,
        category,
        amount,
        description: description || null,
        vendor: vendor || null,
        cost_date: cost_date || new Date().toISOString().split("T")[0],
        reference_id: reference_id || null,
        reference_type: reference_type || null,
      });

    if (insertError) {
      console.error(insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // Recalc job financials (should happen automatically via trigger, but we'll call it explicitly)
    const { error: recalcError } = await supabase.rpc("recalc_job_financials", {
      p_job_id: job_id,
    });

    if (recalcError) {
      console.error("Recalc error:", recalcError);
      // Don't fail the request if recalc fails - trigger should handle it
    }

    return NextResponse.json({ success: true }, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Add cost error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































