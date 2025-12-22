// Block 37444 — SmartSend Roofing Job Costing + Profit Calculator Engine v1
// API Route: Manage job cost items
// GET /api/jobs/[jobId]/costs - List cost items
// POST /api/jobs/[jobId]/costs - Add cost item
// PATCH /api/jobs/[jobId]/costs/[itemId] - Update cost item
// DELETE /api/jobs/[jobId]/costs/[itemId] - Delete cost item

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentTeamId } from "@/lib/team-helpers";

// GET list cost items
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await getServerSupabase();
    const teamId = await getCurrentTeamId();

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID not found" },
        { status: 401 }
      );
    }

    // Verify job exists and belongs to team
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, team_id")
      .eq("id", jobId)
      .eq("team_id", teamId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get cost items
    const { data: costItems, error: itemsError } = await supabase
      .from("job_cost_items")
      .select("*")
      .eq("job_id", jobId)
      .order("cost_date", { ascending: false });

    if (itemsError) {
      console.error("Error fetching cost items:", itemsError);
      return NextResponse.json(
        { error: "Failed to fetch cost items" },
        { status: 500 }
      );
    }

    return NextResponse.json({ costItems: costItems || [] });
  } catch (error: any) {
    console.error("Error in get costs route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST add cost item
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await getServerSupabase();
    const teamId = await getCurrentTeamId();

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID not found" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      category,
      description,
      vendor,
      amount,
      cost_date,
      notes,
      receipt_url,
      receipt_file_name,
      material_type,
      quantity,
      unit,
      unit_cost,
      crew_name,
      hours,
      hourly_rate,
    } = body;

    if (!category || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: category, amount" },
        { status: 400 }
      );
    }

    // Verify job exists and belongs to team
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, team_id")
      .eq("id", jobId)
      .eq("team_id", teamId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Insert cost item
    const { data: costItem, error: insertError } = await supabase
      .from("job_cost_items")
      .insert({
        job_id: jobId,
        team_id: teamId,
        category,
        description: description || null,
        vendor: vendor || null,
        amount: parseFloat(amount),
        cost_date: cost_date || new Date().toISOString().split("T")[0],
        notes: notes || null,
        receipt_url: receipt_url || null,
        receipt_file_name: receipt_file_name || null,
        material_type: material_type || null,
        quantity: quantity ? parseFloat(quantity) : null,
        unit: unit || null,
        unit_cost: unit_cost ? parseFloat(unit_cost) : null,
        crew_name: crew_name || null,
        hours: hours ? parseFloat(hours) : null,
        hourly_rate: hourly_rate ? parseFloat(hourly_rate) : null,
        created_by: user?.id || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting cost item:", insertError);
      return NextResponse.json(
        { error: "Failed to add cost item", details: insertError.message },
        { status: 500 }
      );
    }

    // Profit calculation happens automatically via trigger, but we can also call it explicitly
    await supabase.rpc("calculate_job_profit", { p_job_id: jobId });

    return NextResponse.json({ costItem }, { status: 201 });
  } catch (error: any) {
    console.error("Error in post costs route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































