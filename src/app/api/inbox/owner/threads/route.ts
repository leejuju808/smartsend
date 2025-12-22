import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/owner/threads
 * Fetch inbox threads with filters (Block 20740)
 * Supports: Carrier, Claim Status, Lead Heat, Job Stage, Smart Views, and Search
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

    // Get user's workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    const workspaceId = membership?.workspace_id;
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") || "all"; // Legacy filter: all, hot, warm, follow_up, dead
    const search = searchParams.get("search") || "";
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const assigned_to = searchParams.get("assigned_to"); // User ID for "My Queue" filter
    
    // Block 20740 filters
    const carrier = searchParams.get("carrier"); // Carrier filter
    const claimStatus = searchParams.get("claim_status"); // Claim status filter
    const leadHeat = searchParams.get("lead_heat"); // Lead heat filter (HOT, WARM, NURTURE, COLD, NOT_A_FIT)
    const jobStage = searchParams.get("job_stage"); // Job stage filter
    const smartView = searchParams.get("smart_view"); // Smart view filter

    // Build query using inbox_view for better performance
    // Fallback to inbox_threads if view doesn't exist yet
    // NOTE: `query` is intentionally `any` because we may swap between
    // `inbox_view` (view) and `inbox_threads` (table) at runtime.
    let query: any = supabase
      .from("inbox_view")
      .select(`
        thread_id,
        campaign_id,
        contact_id,
        lead_id,
        workspace_id,
        thread_status,
        last_message_at,
        thread_created_at,
        thread_updated_at,
        first_name,
        last_name,
        contact_email,
        contact_phone,
        contact_name,
        city,
        state,
        contact_address,
        insurance_carrier,
        insurance_claim_status,
        insurance_claim_number,
        insurance_adjuster_name,
        insurance_adjuster_phone,
        insurance_deductible_amount,
        insurance_payout_type,
        insurance_install_ready,
        hot_lead_score,
        lead_heat_level,
        job_stage,
        projected_job_value,
        status_reason,
        has_parsed_scope,
        proposal_sent,
        supplement_opportunity,
        supplement_sent,
        adjuster_contacted,
        adjuster_replied,
        last_message_preview,
        last_direction,
        thread_estimated_value,
        close_probability_score,
        pipeline_stage,
        lead_intent,
        follow_up_stage,
        follow_up_status,
        estimated_job_value,
        job_quality_tag,
        profit_priority_score
      `)
      .eq("workspace_id", workspaceId)
      // Block 270900 — Margin Protection: priority follows profit
      .order("profit_priority_score", { ascending: false })
      .order("last_message_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply Block 20740 filters
    
    // Carrier filter
    if (carrier && carrier !== "null") {
      if (carrier === "Other Carriers") {
        // Filter for carriers not in the main list
        // Use OR to exclude main carriers (NULL or not in list)
        const mainCarriers = ["State Farm", "Allstate", "Farmers", "Liberty Mutual", "USAA", "Travelers", "Progressive", "Geico"];
        // For "Other Carriers", we'll filter client-side after fetching
        // Or use a more complex query - for now, fetch all and filter
      } else {
        query = query.eq("insurance_carrier", carrier);
      }
    }

    // Claim status filter
    if (claimStatus && claimStatus !== "null") {
      query = query.eq("insurance_claim_status", claimStatus);
    }

    // Lead heat filter
    if (leadHeat && leadHeat !== "null") {
      query = query.eq("lead_heat_level", leadHeat);
    }

    // Job stage filter
    if (jobStage && jobStage !== "null") {
      query = query.eq("job_stage", jobStage);
    }

    // Smart Views
    if (smartView && smartView !== "null") {
      if (smartView === "install_ready") {
        query = query.eq("insurance_install_ready", true);
      } else if (smartView === "approved_no_proposal") {
        query = query.eq("insurance_claim_status", "approved").eq("proposal_sent", false);
      } else if (smartView === "needs_supplements") {
        query = query.eq("supplement_opportunity", true).eq("supplement_sent", false);
      } else if (smartView === "waiting_on_adjuster") {
        query = query.eq("adjuster_contacted", true).eq("adjuster_replied", false);
      } else if (smartView === "high_value") {
        query = query.gt("projected_job_value", 20000);
      }
    }

    // Legacy filter support (for backward compatibility)
    if (filter === "hot") {
      query = query.eq("lead_heat_level", "HOT");
    } else if (filter === "warm") {
      query = query.eq("lead_heat_level", "WARM");
    } else if (filter === "dead") {
      query = query.eq("lead_heat_level", "NOT_A_FIT");
    }
    // "all" doesn't filter by intent

    // Filter by assigned_to_user_id (for "My Queue" mode)
    // Note: This requires joining back to inbox_threads since inbox_view doesn't have assigned_to_user_id
    // For now, we'll filter client-side or add it to the view

    let usingFallback = false;
    let { data: threads, error: threadsError } = await query;

    // If inbox_view doesn't exist, fallback to inbox_threads with joins
    if (threadsError && threadsError.message?.includes("relation") && threadsError.message?.includes("inbox_view")) {
      console.warn("inbox_view not found, falling back to inbox_threads");
      usingFallback = true;
      // Fallback query using inbox_threads directly
      query = supabase
        .from("inbox_threads")
        .select(`
          id,
          contact_id,
          campaign_id,
          workspace_id,
          status,
          last_message_at,
          last_message_preview,
          last_direction,
          created_at,
          updated_at,
          insurance_carrier,
          insurance_claim_status,
          insurance_claim_number,
          insurance_adjuster_name,
          insurance_adjuster_phone,
          insurance_deductible_amount,
          insurance_payout_type,
          insurance_install_ready,
          thread_estimated_value,
          close_probability_score,
          pipeline_stage,
          has_parsed_scope,
          profitability_signals,
          contacts:contact_id (
            first_name,
            last_name,
            email,
            phone,
            city,
            state,
            address
          ),
          roofing_jobs!roofing_jobs_thread_id_fkey (
            hot_lead_score,
            current_stage,
            projected_job_value,
            status_reason
          )
        `)
        .eq("workspace_id", workspaceId)
        .order("last_message_at", { ascending: false })
        .range(offset, offset + limit - 1);

      // Reapply filters for fallback query
      if (carrier && carrier !== "null" && carrier !== "Other Carriers") {
        query = query.eq("insurance_carrier", carrier);
      }
      if (claimStatus && claimStatus !== "null") {
        query = query.eq("insurance_claim_status", claimStatus);
      }
      if (jobStage && jobStage !== "null") {
        // This requires a join, so we'll filter client-side
      }
      if (smartView && smartView !== "null") {
        if (smartView === "install_ready") {
          query = query.eq("insurance_install_ready", true);
        } else if (smartView === "approved_no_proposal") {
          query = query.eq("insurance_claim_status", "approved");
        }
      }

      const result = await query;
      threads = result.data;
      threadsError = result.error;
    }

    if (threadsError) {
      console.error("Error fetching threads:", threadsError);
      return NextResponse.json(
        { error: threadsError.message },
        { status: 500 }
      );
    }

    const computeJobQualityTag = (args: {
      lastMessagePreview: string;
      estimatedJobValue: number | null;
      installReady: boolean;
      claimStatus: string | null;
    }): "premium" | "standard" | "low_fit" => {
      const text = (args.lastMessagePreview || "").toLowerCase();
      const lowFit =
        /cheap|cheapest|lowest\s+price|low\s+cost|budget|discount|deal|coupon|how\s+cheap|just\s+a\s+patch|patch\s+job|small\s+repair\s+only|quick\s+patch|handyman|home\s+warranty|warranty\s+company|tenant|renter|landlord/.test(
          text
        ) || (typeof args.estimatedJobValue === "number" && args.estimatedJobValue > 0 && args.estimatedJobValue < 2500 && !args.installReady);
      if (lowFit) return "low_fit";
      if (args.installReady) return "premium";
      if (args.claimStatus && ["approved", "approved_acv_only", "supplements_needed"].includes(args.claimStatus)) return "premium";
      if (typeof args.estimatedJobValue === "number" && args.estimatedJobValue >= 20000) return "premium";
      if (/full\s+roof|roof\s+replacement|replace\s+the\s+roof|reroof|new\s+roof/.test(text)) return "premium";
      return "standard";
    };

    const computeProfitPriorityScore = (args: {
      jobQualityTag: "premium" | "standard" | "low_fit";
      estimatedJobValue: number | null;
      hotLeadScore: number | null;
      installReady: boolean;
      lastMessagePreview: string;
    }): number => {
      const tagWeight = args.jobQualityTag === "premium" ? 100 : args.jobQualityTag === "standard" ? 50 : 0;
      const valueComponent =
        typeof args.estimatedJobValue === "number" && Number.isFinite(args.estimatedJobValue)
          ? Math.min(50, Math.max(0, args.estimatedJobValue / 1000))
          : 0;
      const heatComponent =
        typeof args.hotLeadScore === "number" && Number.isFinite(args.hotLeadScore)
          ? Math.min(50, Math.max(0, args.hotLeadScore / 2))
          : 0;
      const installBonus = args.installReady ? 20 : 0;
      const lowFitPenalty = /cheap|cheapest|lowest\s+price|budget|discount|patch\s+job|handyman|home\s+warranty|tenant|renter|landlord/.test(
        (args.lastMessagePreview || "").toLowerCase()
      )
        ? -75
        : 0;
      return Math.round((tagWeight + valueComponent + heatComponent + installBonus + lowFitPenalty) * 100) / 100;
    };

    // Format threads from inbox_view (preferred) or fallback shape from inbox_threads
    let enrichedThreads = (threads || []).map((thread: any) => {
      if (!usingFallback) {
        return {
          id: thread.thread_id,
          contactId: thread.contact_id,
          campaignId: thread.campaign_id,
          contactName: thread.contact_name || "Unknown",
          contactEmail: thread.contact_email || "",
          contactCity: thread.city || "",
          contactState: thread.state || "",
          contactPhone: thread.contact_phone || "",
          contactAddress: thread.contact_address || "",
          intent: thread.lead_heat_level?.toLowerCase() || null,
          leadScore: thread.hot_lead_score,
          status: thread.thread_status,
          assignedToUserId: null, // TODO: Add to inbox_view
          lastMessageAt: thread.last_message_at,
          lastMessagePreview: thread.last_message_preview?.slice(0, 100) || "",
          lastMessageFrom: thread.last_direction === "in" ? thread.contact_email : "",
          createdAt: thread.thread_created_at,
          updatedAt: thread.thread_updated_at,
          // Block 20740 fields
          insuranceCarrier: thread.insurance_carrier,
          claimStatus: thread.insurance_claim_status,
          leadHeat: thread.lead_heat_level,
          jobStage: thread.job_stage,
          projectedJobValue: thread.projected_job_value,
          claimNumber: thread.insurance_claim_number,
          adjusterName: thread.insurance_adjuster_name,
          adjusterPhone: thread.insurance_adjuster_phone,
          deductibleAmount: thread.insurance_deductible_amount,
          payoutType: thread.insurance_payout_type,
          installReady: thread.insurance_install_ready,
          hasParsedScope: thread.has_parsed_scope,
          proposalSent: thread.proposal_sent,
          supplementOpportunity: thread.supplement_opportunity,
          supplementSent: thread.supplement_sent,
          adjusterContacted: thread.adjuster_contacted,
          adjusterReplied: thread.adjuster_replied,
          // Block 21718: Inbox enrichment fields
          leadIntent: thread.lead_intent || null,
          followUpStage: thread.follow_up_stage || null,
          followUpStatus: thread.follow_up_status || null,
          estimatedJobValue: thread.estimated_job_value || null,
          // Block 270900: Margin protection fields
          jobQualityTag: thread.job_quality_tag || null,
          profitPriorityScore: thread.profit_priority_score ?? null,
        };
      }

      // Fallback: `inbox_threads` shape
      const contact = thread.contacts || null;
      const job = Array.isArray(thread.roofing_jobs) ? thread.roofing_jobs[0] : thread.roofing_jobs || null;
      const hotLeadScore = job?.hot_lead_score ?? null;
      const projectedJobValue = job?.projected_job_value ?? null;
      const estimatedJobValue = thread.thread_estimated_value ?? projectedJobValue ?? null;
      const installReady = Boolean(thread.insurance_install_ready);
      const claimStatus = thread.insurance_claim_status ?? null;
      const lastPreview = String(thread.last_message_preview || "");
      const jobQualityTag = computeJobQualityTag({
        lastMessagePreview: lastPreview,
        estimatedJobValue: typeof estimatedJobValue === "number" ? estimatedJobValue : null,
        installReady,
        claimStatus,
      });
      const profitPriorityScore = computeProfitPriorityScore({
        jobQualityTag,
        estimatedJobValue: typeof estimatedJobValue === "number" ? estimatedJobValue : null,
        hotLeadScore: typeof hotLeadScore === "number" ? hotLeadScore : null,
        installReady,
        lastMessagePreview: lastPreview,
      });

      return {
        id: thread.id,
        contactId: thread.contact_id,
        campaignId: thread.campaign_id,
        contactName:
          contact?.first_name || contact?.last_name
            ? `${contact?.first_name || ""} ${contact?.last_name || ""}`.trim()
            : contact?.email || "Unknown",
        contactEmail: contact?.email || "",
        contactCity: contact?.city || "",
        contactState: contact?.state || "",
        contactPhone: contact?.phone || "",
        contactAddress: contact?.address || "",
        intent: null,
        leadScore: hotLeadScore,
        status: thread.status,
        assignedToUserId: null,
        lastMessageAt: thread.last_message_at,
        lastMessagePreview: lastPreview.slice(0, 100),
        lastMessageFrom: thread.last_direction === "in" ? contact?.email || "" : "",
        createdAt: thread.created_at,
        updatedAt: thread.updated_at,
        insuranceCarrier: thread.insurance_carrier,
        claimStatus: claimStatus,
        leadHeat: null,
        jobStage: job?.current_stage ?? null,
        projectedJobValue,
        claimNumber: thread.insurance_claim_number,
        adjusterName: thread.insurance_adjuster_name,
        adjusterPhone: thread.insurance_adjuster_phone,
        deductibleAmount: thread.insurance_deductible_amount,
        payoutType: thread.insurance_payout_type,
        installReady,
        hasParsedScope: thread.has_parsed_scope,
        proposalSent: null,
        supplementOpportunity: null,
        supplementSent: null,
        adjusterContacted: null,
        adjusterReplied: null,
        leadIntent: null,
        followUpStage: null,
        followUpStatus: null,
        estimatedJobValue: typeof estimatedJobValue === "number" ? estimatedJobValue : null,
        jobQualityTag,
        profitPriorityScore,
      };
    });

    // Apply "Other Carriers" filter if needed (client-side)
    if (carrier === "Other Carriers") {
      const mainCarriers = ["State Farm", "Allstate", "Farmers", "Liberty Mutual", "USAA", "Travelers", "Progressive", "Geico"];
      enrichedThreads = enrichedThreads.filter((thread: any) => {
        const carrier = thread.insuranceCarrier;
        return !carrier || !mainCarriers.includes(carrier);
      });
    }

    // Apply search filter if provided (enhanced search)
    let filteredThreads = enrichedThreads;
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filteredThreads = enrichedThreads.filter((thread: any) => {
        return (
          thread.contactName.toLowerCase().includes(searchLower) ||
          thread.contactEmail.toLowerCase().includes(searchLower) ||
          thread.lastMessagePreview.toLowerCase().includes(searchLower) ||
          thread.insuranceCarrier?.toLowerCase().includes(searchLower) ||
          thread.claimNumber?.toLowerCase().includes(searchLower) ||
          thread.contactPhone?.includes(searchLower) ||
          thread.contactAddress?.toLowerCase().includes(searchLower) ||
          // Search in scope items (if parsed scope exists)
          (thread.hasParsedScope && searchLower.match(/\d+\s*(sq|square|sqft)/i)) ||
          // Search insurance terms
          (searchLower.includes("rcv") && thread.payoutType === "RCV") ||
          (searchLower.includes("acv") && thread.payoutType === "ACV")
        );
      });
    }

    // Filter by assigned_to_user_id (requires join back to inbox_threads)
    if (assigned_to) {
      const threadIds = filteredThreads.map((t: any) => t.id);
      if (threadIds.length > 0) {
        const { data: assignedThreads } = await supabase
          .from("inbox_threads")
          .select("id")
          .in("id", threadIds)
          .eq("assigned_to_user_id", assigned_to);
        
        const assignedIds = new Set(assignedThreads?.map((t: any) => t.id) || []);
        filteredThreads = filteredThreads.filter((thread: any) =>
          assignedIds.has(thread.id)
        );
      } else {
        filteredThreads = [];
      }
    }

    return NextResponse.json({
      threads: filteredThreads,
      total: filteredThreads.length,
    });
  } catch (error: any) {
    console.error("Error in /api/inbox/owner/threads:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

