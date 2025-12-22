// Block 19820 — Inbox Settings Center v1
// API endpoint for fetching and updating inbox settings

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get or create settings for user
    const { data: settings, error } = await supabase.rpc(
      "get_or_create_inbox_settings",
      { p_user_id: user.id }
    );

    if (error) {
      console.error("Error fetching inbox settings:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settings });
  } catch (error: any) {
    console.error("Error in inbox settings API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate and prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    // Helper function to add field if provided
    const addField = (key: string, value: any) => {
      if (value !== undefined) {
        updateData[key] = value;
      }
    };

    // Legacy fields (for backward compatibility)
    addField("default_tab", body.default_tab);
    addField("notify_new_hot", body.notify_new_hot);
    addField("notify_new_warm", body.notify_new_warm);
    addField("notify_new_follow_up", body.notify_new_follow_up);
    addField("notify_booked", body.notify_booked);
    addField("quiet_hours_start", body.quiet_hours_start);
    addField("quiet_hours_end", body.quiet_hours_end);
    addField("lead_priority_weight_hot", body.lead_priority_weight_hot);
    addField("lead_priority_weight_warm", body.lead_priority_weight_warm);
    addField("lead_priority_weight_followup", body.lead_priority_weight_followup);

    // Notification settings (per type and channel)
    addField("notify_hot_leads_push", body.notify_hot_leads_push);
    addField("notify_hot_leads_email", body.notify_hot_leads_email);
    addField("notify_hot_leads_desktop", body.notify_hot_leads_desktop);
    addField("notify_warm_leads_push", body.notify_warm_leads_push);
    addField("notify_warm_leads_email", body.notify_warm_leads_email);
    addField("notify_warm_leads_desktop", body.notify_warm_leads_desktop);
    addField("notify_task_reminders_push", body.notify_task_reminders_push);
    addField("notify_task_reminders_email", body.notify_task_reminders_email);
    addField("notify_task_reminders_desktop", body.notify_task_reminders_desktop);
    addField("notify_daily_digest_email", body.notify_daily_digest_email);
    addField("notify_daily_digest_hour", body.notify_daily_digest_hour);
    addField("notify_weekly_summary_email", body.notify_weekly_summary_email);
    addField("notify_weekly_summary_day", body.notify_weekly_summary_day);
    addField("notify_booked_jobs_push", body.notify_booked_jobs_push);
    addField("notify_booked_jobs_email", body.notify_booked_jobs_email);
    addField("notify_booked_jobs_desktop", body.notify_booked_jobs_desktop);
    addField("notify_activity_feed_push", body.notify_activity_feed_push);
    addField("notify_activity_feed_email", body.notify_activity_feed_email);
    addField("notify_activity_feed_desktop", body.notify_activity_feed_desktop);

    // Quiet hours enhancements
    addField("quiet_hours_days", body.quiet_hours_days);
    addField("quiet_hours_emergency_override", body.quiet_hours_emergency_override);

    // Lead scoring weights
    addField("lead_score_weight_leak_detected", body.lead_score_weight_leak_detected);
    addField("lead_score_weight_active_damage", body.lead_score_weight_active_damage);
    addField("lead_score_weight_storm_event", body.lead_score_weight_storm_event);
    addField("lead_score_weight_insurance_claim", body.lead_score_weight_insurance_claim);
    addField("lead_score_weight_replacement_request", body.lead_score_weight_replacement_request);
    addField("lead_score_weight_budget_check", body.lead_score_weight_budget_check);
    addField("lead_score_weight_price_shopper", body.lead_score_weight_price_shopper);
    addField("lead_score_weight_urgency", body.lead_score_weight_urgency);
    addField("lead_score_weight_multiple_messages", body.lead_score_weight_multiple_messages);
    addField("lead_score_weight_phone_included", body.lead_score_weight_phone_included);

    // Follow-up defaults
    addField("followup_default_timing_hours", body.followup_default_timing_hours);
    addField("followup_auto_reminder_hours", body.followup_auto_reminder_hours);
    addField("followup_warm_lead_sequence_delay_hours", body.followup_warm_lead_sequence_delay_hours);
    addField("followup_no_response_trigger_hours", body.followup_no_response_trigger_hours);
    addField("followup_tone", body.followup_tone);

    // Task defaults
    addField("task_default_priority", body.task_default_priority);
    addField("task_default_due_hours", body.task_default_due_hours);
    addField("task_default_assignee", body.task_default_assignee);
    addField("task_auto_mark_in_progress_on_open", body.task_auto_mark_in_progress_on_open);
    addField("task_auto_close_on_booked", body.task_auto_close_on_booked);
    addField("task_auto_cancel_on_reply", body.task_auto_cancel_on_reply);

    // Layout preferences
    addField("layout_default_tab", body.layout_default_tab);
    addField("layout_thread_preview_length", body.layout_thread_preview_length);
    addField("layout_mode", body.layout_mode);
    addField("layout_show_lead_score", body.layout_show_lead_score);
    addField("layout_show_contact_phone", body.layout_show_contact_phone);
    addField("layout_show_tags", body.layout_show_tags);
    addField("layout_show_activity_feed", body.layout_show_activity_feed);
    addField("layout_show_ai_summary", body.layout_show_ai_summary);

    // AI personalization
    addField("ai_tone", body.ai_tone);
    addField("ai_industry_variant", body.ai_industry_variant);
    addField("ai_region_zip", body.ai_region_zip);
    addField("ai_insurance_heavy", body.ai_insurance_heavy);
    addField("ai_retail_heavy", body.ai_retail_heavy);
    addField("ai_pricing_guidance_sensitivity", body.ai_pricing_guidance_sensitivity);

    // Mobile behavior
    addField("mobile_notifications_enabled", body.mobile_notifications_enabled);
    addField("mobile_vibrate_on_hot_lead", body.mobile_vibrate_on_hot_lead);
    addField("mobile_sound_enabled", body.mobile_sound_enabled);

    // Update settings (upsert to handle first-time creation)
    const { data: settings, error } = await supabase
      .from("inbox_settings")
      .upsert(
        {
          user_id: user.id,
          ...updateData,
        },
        {
          onConflict: "user_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error updating inbox settings:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settings });
  } catch (error: any) {
    console.error("Error in inbox settings update API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

