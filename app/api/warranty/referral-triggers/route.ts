// Block 256100 — Referral Triggers API
// POST /api/warranty/referral-triggers - Trigger referral request
// GET /api/warranty/referral-triggers?customer_id=xxx - Get referral triggers for customer

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: List referral triggers
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customer_id");
    const teamId = searchParams.get("team_id");

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

    let query = supabase
      .from("referral_triggers")
      .select(`
        *,
        customer:customers(id, name, email, phone)
      `)
      .order("created_at", { ascending: false });

    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    if (teamId) {
      query = query.eq("team_id", teamId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching referral triggers:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch referral triggers" },
        { status: 500 }
      );
    }

    return NextResponse.json({ triggers: data || [] }, { status: 200 });
  } catch (error: any) {
    console.error("Error in GET /api/warranty/referral-triggers:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Trigger referral request
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

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
    const {
      customer_id,
      trigger_reason,
      related_job_id,
      happiness_score,
    } = body;

    if (!customer_id || !trigger_reason) {
      return NextResponse.json(
        { error: "Missing required fields: customer_id, trigger_reason" },
        { status: 400 }
      );
    }

    // Trigger referral request using the function
    const { data: triggerId, error: triggerError } = await supabase
      .rpc("trigger_referral_request", {
        p_customer_id: customer_id,
        p_trigger_reason: trigger_reason,
        p_related_job_id: related_job_id || null,
        p_happiness_score: happiness_score || null,
      });

    if (triggerError) {
      console.error("Error triggering referral request:", triggerError);
      return NextResponse.json(
        { error: triggerError.message || "Failed to trigger referral request" },
        { status: 500 }
      );
    }

    if (!triggerId) {
      return NextResponse.json(
        { 
          message: "Referral not triggered - customer happiness score below threshold (70)",
          triggered: false,
        },
        { status: 200 }
      );
    }

    // Get the created trigger
    const { data: trigger, error: fetchError } = await supabase
      .from("referral_triggers")
      .select(`
        *,
        customer:customers(id, name, email, phone)
      `)
      .eq("id", triggerId)
      .single();

    if (fetchError) {
      console.error("Error fetching created trigger:", fetchError);
      return NextResponse.json(
        { error: "Trigger created but failed to fetch details" },
        { status: 500 }
      );
    }

    // TODO: Send referral request message to customer
    // TODO: Schedule follow-up if no response

    return NextResponse.json(
      { 
        trigger,
        message: "Referral request triggered successfully",
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in POST /api/warranty/referral-triggers:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















