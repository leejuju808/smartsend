import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildProposalData,
  generateProposalText,
  type ContractorPreferences,
} from "@/src/lib/ai/proposalBuilder";
import {
  buildProposalV1Data,
  generateProposalV1Text,
  generateInspectionSections,
  type ProposalV1Data,
} from "@/src/lib/ai/proposalBuilderV1";

/**
 * POST /api/inbox/proposals/generate
 * Generate a homeowner-ready proposal from an estimate
 * 
 * Trigger Logic:
 * 1. Contractor clicks "Generate Proposal"
 * 2. AI Estimator (20490) finishes calculating a price
 * 3. Homeowner asks: "Can you send me a quote/proposal?"
 * 4. Insurance claim approved but homeowner undecided
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { threadId, estimateId } = body;

    if (!threadId) {
      return NextResponse.json(
        { error: "threadId is required" },
        { status: 400 }
      );
    }

    // Get thread with all related data
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select(`
        id,
        campaign_id,
        contact_id,
        claim_financials,
        roof_scope,
        profitability_signals,
        insurance_carrier,
        insurance_claim_status,
        contacts:contact_id (
          id,
          workspace_id,
          first_name,
          last_name,
          address_line1,
          address_line2,
          city,
          state,
          postal_code
        )
      `)
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    const workspaceId = thread.contacts?.workspace_id;
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get estimate (use provided estimateId or get latest for thread)
    let estimate;
    if (estimateId) {
      const { data: est, error: estError } = await supabase
        .from("estimates")
        .select(`
          *,
          estimate_line_items (*)
        `)
        .eq("id", estimateId)
        .single();

      if (estError || !est) {
        return NextResponse.json(
          { error: "Estimate not found" },
          { status: 404 }
        );
      }
      estimate = est;
    } else {
      // Get latest estimate for thread
      const { data: latestEstimate, error: latestError } = await supabase
        .from("estimates")
        .select(`
          *,
          estimate_line_items (*)
        `)
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError || !latestEstimate) {
        return NextResponse.json(
          { error: "No estimate found for this thread. Please generate an estimate first." },
          { status: 404 }
        );
      }
      estimate = latestEstimate;
    }

    // Get contractor preferences
    const { data: contractorProfile } = await supabase
      .from("contractor_profile")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const contractorPreferences: ContractorPreferences = {
      company_name: contractorProfile?.company_name || "Your Roofing Company",
      logo_url: contractorProfile?.logo_url,
      default_terms: contractorProfile?.default_terms,
      warranty_type: contractorProfile?.warranty_type,
      payment_expectations: contractorProfile?.payment_expectations,
      message_style: contractorProfile?.message_style || "friendly",
    };

    // Build homeowner name and address
    const firstName = thread.contacts?.first_name || "";
    const lastName = thread.contacts?.last_name || "";
    const homeownerName = `${firstName} ${lastName}`.trim() || "Valued Customer";

    const addressParts = [
      thread.contacts?.address_line1,
      thread.contacts?.address_line2,
      thread.contacts?.city,
      thread.contacts?.state,
      thread.contacts?.postal_code,
    ].filter(Boolean);
    const propertyAddress = addressParts.join(", ") || "Your Property";

    // Get inspection photos from attachments
    const { data: attachments } = await supabase
      .from("attachments")
      .select("id, file_url, file_name, detected_damage_type, ai_label")
      .eq("contact_id", thread.contact_id)
      .like("file_type", "image/%")
      .order("created_at", { ascending: false })
      .limit(10);

    const photos = attachments?.map((att) => ({
      url: att.file_url,
      description: att.ai_label || att.detected_damage_type || "Roof inspection photo",
      severity: "moderate" as const,
    })) || [];

    // Build V1 proposal data structure
    const proposalV1Data = buildProposalV1Data({
      homeownerName,
      propertyAddress,
      estimate,
      roofScope: thread.roof_scope,
      claimFinancials: {
        ...thread.claim_financials,
        carrier: thread.insurance_carrier,
      },
      contractorPreferences,
      photos,
    });

    // Generate inspection sections async
    const inspectionSections = await generateInspectionSections(
      estimate,
      thread.roof_scope,
      photos
    );
    proposalV1Data.inspection_sections = inspectionSections;

    // Generate homeowner-friendly proposal text (V1)
    const proposalText = await generateProposalV1Text(
      proposalV1Data,
      contractorPreferences
    );

    // Create proposal record with V1 data
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .insert({
        thread_id: threadId,
        contact_id: thread.contact_id,
        workspace_id: workspaceId,
        campaign_id: thread.campaign_id,
        estimate_id: estimate.id,
        status: "generated",
        proposal_data: proposalV1Data as any, // Store V1 data structure
        proposal_text: proposalText,
        pricing_tier_model: proposalV1Data.pricing_tier_model,
        visual_elements: proposalV1Data.visual_elements,
        inspection_sections: proposalV1Data.inspection_sections,
        insurance_mode: proposalV1Data.insurance_mode,
        upgrade_options: proposalV1Data.upgrade_options,
        warranty_details: proposalV1Data.warranty_details,
        analytics: {
          views: 0,
          tier_views: { good: 0, better: 0, best: 0 },
          photo_views: {},
          upgrade_interest: {},
        },
        ai_confidence_score: 90,
        generation_metadata: {
          estimate_id: estimate.id,
          generated_at: new Date().toISOString(),
          contractor_preferences: contractorPreferences,
          version: "v1",
        },
      })
      .select()
      .single();

    // Create proposal photos if we have attachments
    if (attachments && attachments.length > 0) {
      const photoInserts = attachments.slice(0, 6).map((att, idx) => ({
        proposal_id: proposal.id,
        attachment_id: att.id,
        photo_url: att.file_url,
        photo_type: idx < 2 ? "before" : "problem_area",
        caption: att.ai_label || att.detected_damage_type || "Roof inspection photo",
        order_index: idx,
        problem_severity: "moderate",
      }));

      await supabase.from("proposal_photos").insert(photoInserts);
    }

    // Create upgrade options
    if (proposalV1Data.upgrade_options && proposalV1Data.upgrade_options.length > 0) {
      const upgradeInserts = proposalV1Data.upgrade_options.map((upgrade) => ({
        proposal_id: proposal.id,
        upgrade_id: upgrade.id,
        upgrade_name: upgrade.name,
        upgrade_description: upgrade.description,
        category: upgrade.category,
        price: upgrade.price,
        selected: upgrade.selected || false,
        image_url: upgrade.image_url,
      }));

      await supabase.from("proposal_upgrades").insert(upgradeInserts);
    }

    if (proposalError) {
      console.error("Error creating proposal:", proposalError);
      return NextResponse.json(
        { error: "Failed to create proposal" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      proposal: {
        ...proposal,
        proposal_data: proposalV1Data,
        proposal_text: proposalText,
      },
      success: true,
    });
  } catch (error) {
    console.error("Error in /api/inbox/proposals/generate:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/inbox/proposals/generate?threadId=xxx
 * Get proposal for a thread
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("threadId");

    if (!threadId) {
      return NextResponse.json(
        { error: "threadId is required" },
        { status: 400 }
      );
    }

    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select(`
        *,
        estimates (*)
      `)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (proposalError) {
      console.error("Error fetching proposal:", proposalError);
      return NextResponse.json(
        { error: "Failed to fetch proposal" },
        { status: 500 }
      );
    }

    if (!proposal) {
      return NextResponse.json(
        { error: "No proposal found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      proposal,
      success: true,
    });
  } catch (error) {
    console.error("Error in GET /api/inbox/proposals/generate:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

