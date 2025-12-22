import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/accounting/insurance
 * Get insurance tracking for jobs
 * Query params: job_id, team_id, status
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id);

    if (!teamMembers || teamMembers.length === 0) {
      return NextResponse.json({ tracking: [] });
    }

    const teamIds = teamMembers.map((tm) => tm.team_id);
    const jobId = searchParams.get("job_id");
    const teamId = searchParams.get("team_id");
    const status = searchParams.get("status");

    let query = supabase
      .from("insurance_tracking")
      .select(`
        *,
        jobs (
          id,
          stage,
          contract_value
        ),
        invoices (
          id,
          invoice_number,
          total_amount
        )
      `)
      .in("team_id", teamIds)
      .order("created_at", { ascending: false });

    if (teamId && teamIds.includes(teamId)) {
      query = query.eq("team_id", teamId);
    }

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: tracking, error } = await query;

    if (error) {
      console.error("Error fetching insurance tracking:", error);
      return NextResponse.json(
        { error: "Failed to fetch insurance tracking", details: error.message },
        { status: 500 }
      );
    }

    // Calculate remaining amounts
    const trackingWithRemaining = (tracking || []).map((item: any) => {
      const acvRemaining = (item.acv_amount || 0) - (item.acv_received || 0);
      const depreciationRemaining = (item.depreciation_amount || 0) - (item.depreciation_received || 0);
      const deductibleRemaining = (item.deductible_amount || 0) - (item.deductible_collected || 0);
      const supplementRemaining = (item.supplement_pending || 0) - (item.supplement_received || 0);
      
      const totalRemaining = acvRemaining + depreciationRemaining + deductibleRemaining + supplementRemaining;

      return {
        ...item,
        acv_remaining: acvRemaining,
        depreciation_remaining: depreciationRemaining,
        deductible_remaining: deductibleRemaining,
        supplement_remaining: supplementRemaining,
        total_remaining: totalRemaining,
      };
    });

    return NextResponse.json({ tracking: trackingWithRemaining });
  } catch (error: any) {
    console.error("Error in insurance tracking:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/accounting/insurance
 * Create or update insurance tracking
 * Body: { job_id, claim_number, insurance_company, acv_amount, depreciation_amount, deductible_amount, ... }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      team_id,
      job_id,
      claim_number,
      insurance_company,
      acv_amount,
      depreciation_amount,
      deductible_amount,
      supplement_amount,
      mortgage_company,
      mortgage_endorsement_required,
      notes,
    } = body;

    if (!team_id || !job_id) {
      return NextResponse.json(
        { error: "Missing required fields: team_id, job_id" },
        { status: 400 }
      );
    }

    // Verify access
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", team_id)
      .eq("user_id", user.id)
      .single();

    if (!teamMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check if tracking already exists
    const { data: existing } = await supabase
      .from("insurance_tracking")
      .select("id")
      .eq("job_id", job_id)
      .single();

    let tracking;
    if (existing) {
      // Update existing
      const { data: updated, error } = await supabase
        .from("insurance_tracking")
        .update({
          claim_number: claim_number || null,
          insurance_company: insurance_company || null,
          acv_amount: acv_amount ? parseFloat(acv_amount) : null,
          depreciation_amount: depreciation_amount ? parseFloat(depreciation_amount) : null,
          deductible_amount: deductible_amount ? parseFloat(deductible_amount) : null,
          supplement_amount: supplement_amount ? parseFloat(supplement_amount) : null,
          mortgage_company: mortgage_company || null,
          mortgage_endorsement_required: mortgage_endorsement_required || false,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        throw error;
      }
      tracking = updated;
    } else {
      // Create new
      const { data: created, error } = await supabase
        .from("insurance_tracking")
        .insert({
          team_id,
          job_id,
          claim_number: claim_number || null,
          insurance_company: insurance_company || null,
          acv_amount: acv_amount ? parseFloat(acv_amount) : null,
          depreciation_amount: depreciation_amount ? parseFloat(depreciation_amount) : null,
          deductible_amount: deductible_amount ? parseFloat(deductible_amount) : null,
          supplement_amount: supplement_amount ? parseFloat(supplement_amount) : null,
          mortgage_company: mortgage_company || null,
          mortgage_endorsement_required: mortgage_endorsement_required || false,
          notes: notes || null,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }
      tracking = created;
    }

    return NextResponse.json({ tracking });
  } catch (error: any) {
    console.error("Error in insurance tracking:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

