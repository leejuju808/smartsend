// Block 20710 — SmartSend Roofing Contact Card v1
// GET /api/contacts/[id]/roofing-card
// Returns all data needed for the comprehensive roofing contact card

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id: contactId } = await params;
    
    // Get current workspace
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // 1. Get contact basic info
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select(`
        id,
        email,
        first_name,
        last_name,
        phone,
        address,
        city,
        state,
        zip_code,
        pipeline_stage,
        created_at
      `)
      .eq("id", contactId)
      .eq("workspace_id", workspaceId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    // 2. Get thread data (for insurance, scope, estimates, proposals)
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select(`
        id,
        insurance_carrier,
        insurance_claim_status,
        insurance_claim_number,
        insurance_deductible_amount,
        insurance_deductible_type,
        insurance_payout_type,
        insurance_depreciation_recoverable,
        insurance_depreciation_amount,
        insurance_adjuster_name,
        insurance_adjuster_email,
        insurance_install_ready,
        insurance_analyzed_at,
        hot_lead_score,
        hot_lead_tier,
        roof_scope,
        claim_financials,
        profitability_signals,
        has_parsed_scope,
        property_address,
        last_message_at,
        last_message_direction,
        scope_comparison_id,
        supplement_opportunity_total,
        rcv_underpayment,
        o_and_p_missing,
        o_and_p_missing_value,
        code_conflicts_detected
      `)
      .eq("contact_id", contactId)
      .eq("workspace_id", workspaceId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Get hot lead score (from block 20430)
    const hotLeadScore = thread?.hot_lead_score || null;
    const hotLeadTier = thread?.hot_lead_tier || null;

    // 4. Get current stage (from block 20620 - roofing_jobs)
    let roofingJob = null;
    if (thread?.id) {
      const { data: job } = await supabase
        .from("roofing_jobs")
        .select("current_stage, stage_changed_at")
        .eq("thread_id", thread.id)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      roofingJob = job;
    }
    
    if (!roofingJob) {
      const { data: job } = await supabase
        .from("roofing_jobs")
        .select("current_stage, stage_changed_at")
        .eq("contact_id", contactId)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      roofingJob = job;
    }

    const currentStage = roofingJob?.current_stage || thread?.insurance_claim_status || contact.pipeline_stage || "NEW_LEAD";

    // 5. Get scope comparison v2 (from block 21020)
    let scopeComparison = null;
    if (thread?.scope_comparison_id) {
      const { data: comparison } = await supabase
        .from("scope_comparisons")
        .select(`
          id,
          insurance_rcv,
          insurance_acv,
          insurance_deductible,
          insurance_depreciation,
          insurance_depreciation_recoverable,
          insurance_net_claim,
          smartsend_estimate_total,
          smartsend_rcv,
          rcv_difference,
          underpayment_amount,
          missing_line_items,
          underpriced_line_items,
          quantity_mismatches,
          o_and_p_included,
          o_and_p_should_be_included,
          o_and_p_missing_value,
          o_and_p_justification,
          code_items_missing,
          code_conflicts_detected,
          total_supplement_opportunity,
          supplement_breakdown,
          supplement_types,
          created_at,
          updated_at
        `)
        .eq("id", thread.scope_comparison_id)
        .single();
      scopeComparison = comparison;
    }

    // 6. Get roof estimate (from block 20490)
    let roofEstimate = null;
    if (thread?.id) {
      const { data: estimate } = await supabase
        .from("roof_estimates")
        .select(`
          id,
          base_rate_per_sq,
          squares,
          steep_charge,
          two_story_charge,
          calculated_total,
          final_bid_price,
          insurance_rcv,
          insurance_acv,
          insurance_deductible,
          supplement_value_estimate,
          missing_items_supplements,
          created_at,
          updated_at
        `)
        .eq("thread_id", thread.id)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      roofEstimate = estimate;
    }

    // 7. Get proposal (from blocks 20520 + 20560)
    let proposal = null;
    if (thread?.id) {
      const { data: prop } = await supabase
        .from("proposals")
        .select(`
          id,
          status,
          proposal_text,
          proposal_data,
          created_at,
          sent_at,
          email_sent_at
        `)
        .eq("thread_id", thread.id)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      proposal = prop;
    }

    // Get proposal email sends
    let proposalEmailSends: any[] = [];
    if (proposal) {
      const { data: sends } = await supabase
        .from("proposal_email_sends")
        .select(`
          id,
          sent_at,
          opened_at,
          clicked_at,
          status
        `)
        .eq("proposal_id", proposal.id)
        .order("sent_at", { ascending: false });
      proposalEmailSends = sends || [];
    }

    // 8. Get adjuster emails (from block 20590)
    let adjusterEmails: any[] = [];
    if (thread?.id) {
      const { data: emails } = await supabase
        .from("adjuster_emails")
        .select(`
          id,
          email_type,
          subject,
          status,
          sent_at,
          created_at,
          trigger_reason,
          missing_items,
          supplement_value_estimate
        `)
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: false })
        .limit(20);
      adjusterEmails = emails || [];
    }

    // 9. Get claim journey timeline v2 (from block 21050)
    let timelineEvents: any[] = [];
    let discrepancies: any[] = [];
    
    // Use v2 function to get timeline with discrepancies
    const { data: timelineData } = await supabase.rpc('get_claim_journey_timeline_v2', {
      p_thread_id: thread?.id || null,
      p_contact_id: contactId,
      p_lead_id: null,
    });
    
    if (timelineData) {
      timelineEvents = timelineData.timeline_events || [];
      discrepancies = timelineData.discrepancies || [];
    } else {
      // Fallback to direct query if function not available
      const timelineQuery = supabase
        .from("insurance_timeline_events")
        .select(`
          id,
          event_type,
          event_date,
          event_time,
          event_payload,
          structured_data,
          detected_from,
          source_type,
          detection_confidence,
          confidence_score,
          raw_text,
          created_at
        `);
      
      if (thread?.id) {
        timelineQuery.eq("thread_id", thread.id);
      } else {
        timelineQuery.eq("contact_id", contactId);
      }
      
      const { data: events } = await timelineQuery
        .order("event_time", { ascending: true, nullsFirst: true })
        .order("event_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      timelineEvents = events || [];
      
      // Get discrepancies
      const discQuery = supabase
        .from("insurance_timeline_discrepancies")
        .select("*")
        .eq("is_resolved", false);
      
      if (thread?.id) {
        discQuery.eq("thread_id", thread.id);
      } else {
        discQuery.eq("contact_id", contactId);
      }
      
      const { data: discs } = await discQuery.order("detected_at", { ascending: false });
      discrepancies = discs || [];
    }

    // 10. Get activity feed (from block 20680)
    const { data: activityLogs } = await supabase
      .from("activity_logs_v2")
      .select(`
        id,
        category,
        type,
        severity,
        summary,
        details,
        source,
        created_at,
        user:user_id (
          id,
          email,
          raw_user_meta_data
        )
      `)
      .eq("contact_id", contactId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);

    // 11. Get last activity timestamp
    const lastActivity = thread?.last_message_at 
      ? new Date(thread.last_message_at)
      : activityLogs?.[0]?.created_at 
        ? new Date(activityLogs[0].created_at)
        : null;

    // 12. Get revenue forecast (Block 21260)
    let revenueForecast = null;
    if (thread?.id) {
      const { data: forecast } = await supabase
        .rpc("get_revenue_forecast_panel", {
          p_thread_id: thread.id,
        });
      revenueForecast = forecast || null;
    }

    // Format response
    const fullAddress = contact.address 
      ? `${contact.address}${contact.city ? `, ${contact.city}` : ""}${contact.state ? `, ${contact.state}` : ""}${contact.zip_code ? ` ${contact.zip_code}` : ""}`.trim()
      : `${contact.city || ""} ${contact.state || ""} ${contact.zip_code || ""}`.trim();

    return NextResponse.json({
      contact: {
        id: contact.id,
        name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.email,
        firstName: contact.first_name,
        lastName: contact.last_name,
        email: contact.email,
        phone: contact.phone,
        address: fullAddress || "No address",
        city: contact.city,
        state: contact.state,
        zip: contact.zip_code,
      },
      homeownerOverview: {
        name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.email,
        address: fullAddress || "No address",
        carrier: thread?.insurance_carrier || null,
        claimNumber: thread?.insurance_claim_number || null,
        currentStage: currentStage,
        hotLeadScore: hotLeadScore,
        hotLeadTier: hotLeadTier,
        phone: contact.phone,
        email: contact.email,
        threadId: thread?.id || null,
        lastActivity: lastActivity ? lastActivity.toISOString() : null,
        lastActivityType: thread?.last_message_direction === "in" ? "Received message" : thread?.last_message_direction === "out" ? "Sent message" : null,
      },
      insuranceBrain: {
        carrier: thread?.insurance_carrier || null,
        claimStatus: thread?.insurance_claim_status || null,
        deductible: thread?.insurance_deductible_amount || null,
        deductibleType: thread?.insurance_deductible_type || null,
        payoutType: thread?.insurance_payout_type || null,
        depreciationRecoverable: thread?.insurance_depreciation_recoverable || false,
        depreciationAmount: thread?.insurance_depreciation_amount || null,
        claimFiledDate: thread?.claim_financials?.claim_filed_date || null,
        approvalDate: thread?.claim_financials?.approval_date || null,
        adjusterName: thread?.insurance_adjuster_name || null,
        adjusterEmail: thread?.insurance_adjuster_email || null,
        installReady: thread?.insurance_install_ready || false,
        rcv: thread?.claim_financials?.rcv || roofEstimate?.insurance_rcv || null,
        acv: thread?.claim_financials?.acv || roofEstimate?.insurance_acv || null,
      },
      scope: {
        squares: thread?.roof_scope?.squares || roofEstimate?.squares || null,
        material: thread?.roof_scope?.material || null,
        pitch: thread?.roof_scope?.pitch || null,
        isSteep: thread?.roof_scope?.is_steep || thread?.roof_scope?.pitch === "steep" || false,
        stories: thread?.roof_scope?.stories || null,
        wastePercent: thread?.roof_scope?.waste_percent || null,
        keyLineItems: thread?.roof_scope?.line_items || [],
        missingItems: thread?.profitability_signals?.missing_items || roofEstimate?.missing_items_supplements || [],
        codeItemsIncluded: thread?.roof_scope?.code_items || [],
        // Block 21020 — v2 Scope Analysis
        scopeAnalysisV2: scopeComparison ? {
          insuranceRcv: scopeComparison.insurance_rcv,
          smartsendEstimateTotal: scopeComparison.smartsend_estimate_total,
          rcvDifference: scopeComparison.rcv_difference,
          underpaymentAmount: scopeComparison.underpayment_amount,
          totalSupplementOpportunity: scopeComparison.total_supplement_opportunity,
          missingLineItems: scopeComparison.missing_line_items || [],
          underpricedLineItems: scopeComparison.underpriced_line_items || [],
          quantityMismatches: scopeComparison.quantity_mismatches || [],
          oAndP: {
            included: scopeComparison.o_and_p_included,
            shouldBeIncluded: scopeComparison.o_and_p_should_be_included,
            missingValue: scopeComparison.o_and_p_missing_value,
            justification: scopeComparison.o_and_p_justification
          },
          codeItemsMissing: scopeComparison.code_items_missing || [],
          codeConflictsDetected: scopeComparison.code_conflicts_detected,
          supplementBreakdown: scopeComparison.supplement_breakdown || {},
          supplementTypes: scopeComparison.supplement_types || []
        } : null,
        // Quick access from thread
        supplementOpportunityTotal: thread?.supplement_opportunity_total || 0,
        rcvUnderpayment: thread?.rcv_underpayment || 0,
        oAndPMissing: thread?.o_and_p_missing || false,
        oAndPMissingValue: thread?.o_and_p_missing_value || 0,
        codeConflictsDetected: thread?.code_conflicts_detected || false,
      },
      estimate: {
        baseRatePerSq: roofEstimate?.base_rate_per_sq || null,
        totalEstimate: roofEstimate?.final_bid_price || roofEstimate?.calculated_total || null,
        supplementValue: roofEstimate?.supplement_value_estimate || null,
        insuranceRcv: roofEstimate?.insurance_rcv || thread?.claim_financials?.rcv || null,
        insuranceAcv: roofEstimate?.insurance_acv || thread?.claim_financials?.acv || null,
        priceComparison: roofEstimate?.final_bid_price && roofEstimate?.insurance_rcv 
          ? {
              estimate: roofEstimate.final_bid_price,
              rcv: roofEstimate.insurance_rcv,
              difference: roofEstimate.final_bid_price - roofEstimate.insurance_rcv,
            }
          : null,
      },
      proposal: {
        id: proposal?.id || null,
        created: proposal?.created_at || null,
        sent: proposal?.sent_at || proposal?.email_sent_at || null,
        text: proposal?.proposal_text || null,
        data: proposal?.proposal_data || null,
        status: proposal?.status || null,
        emailSends: proposalEmailSends || [],
      },
      adjusterCommunications: (adjusterEmails || []).map((email) => ({
        id: email.id,
        type: email.email_type,
        subject: email.subject,
        status: email.status,
        sentAt: email.sent_at,
        createdAt: email.created_at,
        triggerReason: email.trigger_reason,
        missingItems: email.missing_items || [],
        supplementValue: email.supplement_value_estimate || null,
      })),
      timeline: (timelineEvents || []).map((event) => ({
        id: event.id,
        event_type: event.event_type,
        event_date: event.event_date,
        event_time: event.event_time,
        event_payload: event.event_payload,
        structured_data: event.structured_data,
        detected_from: event.detected_from,
        source_type: event.source_type,
        detection_confidence: event.detection_confidence,
        confidence_score: event.confidence_score,
        raw_text: event.raw_text,
        created_at: event.created_at,
      })),
      discrepancies: (discrepancies || []).map((disc) => ({
        id: disc.id,
        discrepancy_type: disc.discrepancy_type,
        severity: disc.severity,
        detected_value: disc.detected_value,
        detected_at: disc.detected_at,
      })),
      activityFeed: (activityLogs || []).map((log) => ({
        id: log.id,
        category: log.category,
        type: log.type,
        severity: log.severity,
        summary: log.summary,
        details: log.details,
        source: log.source,
        createdAt: log.created_at,
        user: log.user,
      })),
      // Block 21260 — Revenue Forecast Brain v1
      revenueForecast: revenueForecast ? {
        rcvRevenue: revenueForecast.rcv_revenue,
        supplementRevenue: revenueForecast.supplement_revenue,
        upsellRevenue: revenueForecast.upsell_revenue,
        installProbability: revenueForecast.install_probability,
        installProbabilityCategory: revenueForecast.install_probability_category,
        trueJobValue: revenueForecast.true_job_value,
        supplementBreakdown: revenueForecast.supplement_breakdown,
        supplementInsights: revenueForecast.supplement_insights,
        upsellBreakdown: revenueForecast.upsell_breakdown,
        upsellInsights: revenueForecast.upsell_insights,
        installProbabilityBreakdown: revenueForecast.install_probability_breakdown,
        installProbabilitySignals: revenueForecast.install_probability_signals,
        calculatedAt: revenueForecast.calculated_at,
      } : null,
    });
  } catch (error) {
    console.error("[Roofing Contact Card] Error:", error);
    return NextResponse.json(
      { error: "Failed to load contact card data", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

