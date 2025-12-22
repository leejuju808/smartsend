// Block 27400 — SmartSend Roofing Referral & Review Engine v1
// API Route: Create Referral + Seed New Lead
// POST /api/referral/[job_id]

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;
    const { referred_name, referred_email, referred_phone, referred_address } = await req.json();

    if (!referred_name || !referred_name.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find referrer info from job
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        workspace_id,
        lead_id
      `)
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Try to find customer_id from roofing_customers
    let customerId: string | null = null;
    if (job.lead_id) {
      const { data: customer } = await supabase
        .from("roofing_customers")
        .select("id")
        .eq("workspace_id", job.workspace_id)
        .or(`contact_id.eq.${job.lead_id},email.eq.${referred_email}`)
        .limit(1)
        .maybeSingle();

      if (customer) {
        customerId = customer.id;
      }
    }

    // Insert referral record
    const { data: ref, error: refError } = await supabase
      .from("roofing_referrals")
      .insert({
        referrer_customer_id: customerId,
        referrer_job_id: job_id,
        referred_name: referred_name.trim(),
        referred_email: referred_email?.trim() || null,
        referred_phone: referred_phone?.trim() || null,
        referred_address: referred_address?.trim() || null,
      })
      .select("*")
      .single();

    if (refError) {
      console.error("Error creating referral:", refError);
      return NextResponse.json(
        { error: "Failed to create referral" },
        { status: 500 }
      );
    }

    // Option: auto-create lead if email or phone provided
    let linkedLeadId: string | null = null;
    if (referred_email || referred_phone) {
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .insert({
          workspace_id: job.workspace_id,
          email: referred_email?.trim() || null,
          phone: referred_phone?.trim() || null,
          name: referred_name.trim(),
          first_name: referred_name.trim().split(" ")[0] || null,
          last_name: referred_name.trim().split(" ").slice(1).join(" ") || null,
          address: referred_address?.trim() || null,
          source: "referral",
          metadata: {
            referral_job_id: job_id,
            referral_id: ref.id,
            source_details: `Referral from job ${job_id}`,
          },
        })
        .select("id")
        .single();

      if (lead && !leadError) {
        linkedLeadId = lead.id;

        // Update referral with linked lead
        await supabase
          .from("roofing_referrals")
          .update({ linked_lead_id: lead.id })
          .eq("id", ref.id);
      }
    }

    // Update referral request status if exists
    await supabase
      .from("roofing_referral_requests")
      .update({
        status: "responded",
        responded_at: new Date().toISOString(),
      })
      .eq("job_id", job_id)
      .eq("status", "sent");

    return NextResponse.json({
      success: true,
      referral_id: ref.id,
      lead_id: linkedLeadId,
    });
  } catch (error) {
    console.error("Error in referral API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}



































