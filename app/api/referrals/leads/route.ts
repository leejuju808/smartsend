import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/referrals/leads
 * Get referral leads for a workspace
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Get referral leads with related data
    const { data: referralLeads, error } = await supabase
      .from("referral_leads")
      .select(`
        *,
        referral_links!inner(
          id,
          portal_id,
          job_id,
          homeowner_portals!inner(
            id,
            roofing_jobs!inner(
              id,
              workspace_id,
              title,
              leads(
                id,
                first_name,
                last_name,
                email
              )
            )
          )
        )
      `)
      .eq("referral_links.homeowner_portals.roofing_jobs.workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching referral leads:", error);
      return NextResponse.json(
        { error: "Failed to fetch referral leads" },
        { status: 500 }
      );
    }

    return NextResponse.json({ referralLeads });
  } catch (error: any) {
    console.error("Error in GET /api/referrals/leads:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/referrals/leads
 * Create a new referral lead (from public referral landing page)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { referralId, homeownerName, homeownerEmail, homeownerPhone, message } = body;

    if (!referralId || !homeownerName || !homeownerEmail) {
      return NextResponse.json(
        { error: "referralId, homeownerName, and homeownerEmail are required" },
        { status: 400 }
      );
    }

    // Create referral lead
    const { data: referralLead, error: leadError } = await supabase
      .from("referral_leads")
      .insert({
        referral_id: referralId,
        homeowner_name: homeownerName,
        homeowner_email: homeownerEmail,
        homeowner_phone: homeownerPhone || null,
        message: message || null,
      })
      .select()
      .single();

    if (leadError) {
      console.error("Error creating referral lead:", leadError);
      return NextResponse.json(
        { error: "Failed to create referral lead" },
        { status: 500 }
      );
    }

    // Increment leads_generated count on referral_link
    const { error: updateError } = await supabase.rpc("increment_referral_leads", {
      referral_link_id: referralId,
    });

    if (updateError) {
      // If RPC doesn't exist, manually update
      await supabase
        .from("referral_links")
        .update({
          leads_generated: supabase.raw("leads_generated + 1"),
        })
        .eq("id", referralId);
    }

    // Increment clicks count
    await supabase
      .from("referral_links")
      .update({
        clicks: supabase.raw("clicks + 1"),
      })
      .eq("id", referralId);

    return NextResponse.json({ 
      success: true,
      referralLead 
    });
  } catch (error: any) {
    console.error("Error in POST /api/referrals/leads:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























