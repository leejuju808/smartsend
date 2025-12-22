import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/insights/dashboard
 * Get SmartSend Insights v2 dashboard data - All 5 major panels
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Fetch all insights panels in parallel
    const [
      leadInsights,
      stormInsights,
      insuranceInsights,
      replyMetrics,
      conversionInsights,
      campaignInsights,
      appointmentMetrics,
      timelineInsights,
    ] = await Promise.all([
      supabaseAdmin
        .from("insights_leads")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabaseAdmin
        .from("insights_storm")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabaseAdmin
        .from("insights_insurance")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabaseAdmin
        .from("insights_reply_metrics")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabaseAdmin
        .from("insights_conversions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabaseAdmin
        .from("insights_campaigns")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabaseAdmin
        .from("insights_appointment_metrics")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabaseAdmin
        .from("insights_timeline")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
    ]);

    return NextResponse.json({
      // 1️⃣ Lead Intelligence Panel
      lead_intelligence: {
        avg_lead_heat: leadInsights.data?.avg_lead_heat || 0,
        hot_leads_count: leadInsights.data?.hot_leads_count || 0,
        warm_leads_count: leadInsights.data?.warm_leads_count || 0,
        cold_leads_count: leadInsights.data?.cold_leads_count || 0,
        leads_needing_reply: leadInsights.data?.leads_needing_reply || 0,
        neglected_leads: leadInsights.data?.neglected_leads || 0,
        high_value_leads: leadInsights.data?.high_value_leads || 0,
        insurance_leads_count: leadInsights.data?.insurance_leads_count || 0,
        storm_affected_leads: leadInsights.data?.storm_affected_leads || 0,
        leads_with_photos: leadInsights.data?.leads_with_photos || 0,
        hot_leads_list: leadInsights.data?.hot_leads_list || [],
        warm_leads_list: leadInsights.data?.warm_leads_list || [],
        neglected_leads_list: leadInsights.data?.neglected_leads_list || [],
        high_value_leads_list: leadInsights.data?.high_value_leads_list || [],
        calculated_at: leadInsights.data?.calculated_at,
      },

      // 2️⃣ Storm Insights Panel
      storm_insights: {
        storm_affected_zips: stormInsights.data?.storm_affected_zips || [],
        total_storm_homes: stormInsights.data?.total_storm_homes || 0,
        hot_storm_homes: stormInsights.data?.hot_storm_homes || 0,
        hail_sizes: stormInsights.data?.hail_sizes || [],
        wind_speeds: stormInsights.data?.wind_speeds || [],
        max_hail_size: stormInsights.data?.max_hail_size || null,
        max_wind_speed: stormInsights.data?.max_wind_speed || null,
        potential_storm_revenue: Number(stormInsights.data?.potential_storm_revenue || 0),
        storm_jobs_in_pipeline: stormInsights.data?.storm_jobs_in_pipeline || 0,
        storm_breakdown: stormInsights.data?.storm_breakdown || [],
        recommended_neighborhoods: stormInsights.data?.recommended_neighborhoods || [],
        suggested_storm_sequences: stormInsights.data?.suggested_storm_sequences || [],
        calculated_at: stormInsights.data?.calculated_at,
      },

      // 3️⃣ Insurance Intelligence Panel
      insurance_intelligence: {
        insurance_interest_leads: insuranceInsights.data?.insurance_interest_leads || 0,
        filed_claims_count: insuranceInsights.data?.filed_claims_count || 0,
        pending_claims_count: insuranceInsights.data?.pending_claims_count || 0,
        approved_claims_count: insuranceInsights.data?.approved_claims_count || 0,
        total_deductible_value: Number(insuranceInsights.data?.total_deductible_value || 0),
        avg_deductible_value: Number(insuranceInsights.data?.avg_deductible_value || 0),
        expected_insurance_payout: Number(insuranceInsights.data?.expected_insurance_payout || 0),
        adjuster_scheduled_leads: insuranceInsights.data?.adjuster_scheduled_leads || 0,
        adjuster_contacted_leads: insuranceInsights.data?.adjuster_contacted_leads || 0,
        insurance_win_rate: Number(insuranceInsights.data?.insurance_win_rate || 0),
        insurance_follow_up_tasks: insuranceInsights.data?.insurance_follow_up_tasks || 0,
        avg_days_to_follow_up: Number(insuranceInsights.data?.avg_days_to_follow_up || 0),
        stalled_insurance_leads: insuranceInsights.data?.stalled_insurance_leads || 0,
        insurance_leads_list: insuranceInsights.data?.insurance_leads_list || [],
        filed_claims_list: insuranceInsights.data?.filed_claims_list || [],
        adjuster_scheduled_list: insuranceInsights.data?.adjuster_scheduled_list || [],
        calculated_at: insuranceInsights.data?.calculated_at,
      },

      // 4️⃣ Reply & Follow-Up Insights
      reply_insights: {
        reply_rate: Number(replyMetrics.data?.reply_rate || 0),
        open_rate: Number(replyMetrics.data?.open_rate || 0),
        unread_messages_count: replyMetrics.data?.unread_messages_count || 0,
        avg_response_time_hours: Number(replyMetrics.data?.avg_response_time_hours || 0),
        stalled_conversations: replyMetrics.data?.stalled_conversations || 0,
        missed_booking_opportunities: replyMetrics.data?.missed_booking_opportunities || 0,
        messages_needing_follow_up: replyMetrics.data?.messages_needing_follow_up || 0,
        aging_replies: replyMetrics.data?.aging_replies || 0,
        stalled_conversations_list: replyMetrics.data?.stalled_conversations_list || [],
        missed_opportunities_list: replyMetrics.data?.missed_opportunities_list || [],
        follow_up_needed_list: replyMetrics.data?.follow_up_needed_list || [],
        calculated_at: replyMetrics.data?.calculated_at,
      },

      // 5️⃣ Conversion Path Insights
      conversion_insights: {
        cold_to_warm_count: conversionInsights.data?.cold_to_warm_count || 0,
        warm_to_hot_count: conversionInsights.data?.warm_to_hot_count || 0,
        hot_to_appointment_count: conversionInsights.data?.hot_to_appointment_count || 0,
        appointment_to_quote_count: conversionInsights.data?.appointment_to_quote_count || 0,
        quote_to_won_count: conversionInsights.data?.quote_to_won_count || 0,
        cold_to_warm_rate: Number(conversionInsights.data?.cold_to_warm_rate || 0),
        warm_to_hot_rate: Number(conversionInsights.data?.warm_to_hot_rate || 0),
        hot_to_appointment_rate: Number(conversionInsights.data?.hot_to_appointment_rate || 0),
        appointment_to_quote_rate: Number(conversionInsights.data?.appointment_to_quote_rate || 0),
        quote_to_won_rate: Number(conversionInsights.data?.quote_to_won_rate || 0),
        overall_conversion_rate: Number(conversionInsights.data?.overall_conversion_rate || 0),
        drop_off_at_warm: Number(conversionInsights.data?.drop_off_at_warm || 0),
        drop_off_at_hot: Number(conversionInsights.data?.drop_off_at_hot || 0),
        drop_off_at_appointment: Number(conversionInsights.data?.drop_off_at_appointment || 0),
        drop_off_at_quote: Number(conversionInsights.data?.drop_off_at_quote || 0),
        avg_days_in_cold: Number(conversionInsights.data?.avg_days_in_cold || 0),
        avg_days_in_warm: Number(conversionInsights.data?.avg_days_in_warm || 0),
        avg_days_in_hot: Number(conversionInsights.data?.avg_days_in_hot || 0),
        avg_days_in_appointment: Number(conversionInsights.data?.avg_days_in_appointment || 0),
        avg_days_in_quote: Number(conversionInsights.data?.avg_days_in_quote || 0),
        biggest_bottleneck: conversionInsights.data?.biggest_bottleneck || null,
        bottleneck_reason: conversionInsights.data?.bottleneck_reason || null,
        suggested_improvements: conversionInsights.data?.suggested_improvements || [],
        calculated_at: conversionInsights.data?.calculated_at,
      },

      // Campaign Insights
      campaign_insights: {
        best_subject_line: campaignInsights.data?.best_subject_line || null,
        best_subject_line_open_rate: Number(campaignInsights.data?.best_subject_line_open_rate || 0),
        best_template_id: campaignInsights.data?.best_template_id || null,
        best_template_name: campaignInsights.data?.best_template_name || null,
        best_template_reply_rate: Number(campaignInsights.data?.best_template_reply_rate || 0),
        best_time_of_day: campaignInsights.data?.best_time_of_day || null,
        best_day_of_week: campaignInsights.data?.best_day_of_week || null,
        best_list_type: campaignInsights.data?.best_list_type || null,
        best_list_id: campaignInsights.data?.best_list_id || null,
        best_list_name: campaignInsights.data?.best_list_name || null,
        open_rate_distribution: campaignInsights.data?.open_rate_distribution || {},
        reply_rate_distribution: campaignInsights.data?.reply_rate_distribution || {},
        booking_rate_by_template: campaignInsights.data?.booking_rate_by_template || {},
        storm_campaign_performance: campaignInsights.data?.storm_campaign_performance || {},
        non_storm_campaign_performance: campaignInsights.data?.non_storm_campaign_performance || {},
        calculated_at: campaignInsights.data?.calculated_at,
      },

      // Appointment Insights
      appointment_insights: {
        booking_rate: Number(appointmentMetrics.data?.booking_rate || 0),
        no_show_rate: Number(appointmentMetrics.data?.no_show_rate || 0),
        best_appointment_time: appointmentMetrics.data?.best_appointment_time || null,
        best_appointment_day: appointmentMetrics.data?.best_appointment_day || null,
        avg_time_to_book_hours: Number(appointmentMetrics.data?.avg_time_to_book_hours || 0),
        avg_time_to_close_after_appointment_days: Number(
          appointmentMetrics.data?.avg_time_to_close_after_appointment_days || 0
        ),
        scheduler_usage_percent: Number(appointmentMetrics.data?.scheduler_usage_percent || 0),
        homeowner_behavior_patterns: appointmentMetrics.data?.homeowner_behavior_patterns || {},
        calculated_at: appointmentMetrics.data?.calculated_at,
      },

      // Timeline Insights
      timeline_insights: {
        reply_spikes: timelineInsights.data?.reply_spikes || [],
        campaign_peaks: timelineInsights.data?.campaign_peaks || [],
        storm_events: timelineInsights.data?.storm_events || [],
        insurance_claim_waves: timelineInsights.data?.insurance_claim_waves || [],
        busiest_hours: timelineInsights.data?.busiest_hours || {},
        quiet_hours: timelineInsights.data?.quiet_hours || {},
        weekend_performance: timelineInsights.data?.weekend_performance || {},
        calculated_at: timelineInsights.data?.calculated_at,
      },
    });
  } catch (error: any) {
    console.error("Insights dashboard error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

