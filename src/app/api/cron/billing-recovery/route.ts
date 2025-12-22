/**
 * Block 23690 — SmartSend Billing Recovery Cron Job
 * Processes scheduled recovery actions (pre-bill reminders, recovery stages, win-back)
 * Runs every hour
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendPreBillReminder,
  sendRecoverySMSStage1,
  sendRecoveryEmailStage2,
  sendRecoveryEmailStage3,
  scheduleRecoveryPhoneCall,
  sendRecoveryEmailStage5,
  sendWinBackEmail1,
  sendWinBackEmail2,
  sendWinBackSMS,
} from "@/lib/billing/recovery-service";
import Stripe from "stripe";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const results = {
      preBillReminders: 0,
      recoveryActions: 0,
      winBackActions: 0,
      errors: [] as string[],
    };

    // ============================================================================
    // PHASE 1 — PREVENT: Pre-Bill Reminders (3 days before renewal)
    // ============================================================================
    try {
      // Get subscriptions renewing in 3 days
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const threeDaysStart = new Date(threeDaysFromNow.setHours(0, 0, 0, 0));
      const threeDaysEnd = new Date(threeDaysFromNow.setHours(23, 59, 59, 999));

      // Get active subscriptions from workspace_subscriptions
      const { data: subscriptions } = await supabase
        .from("workspace_subscriptions")
        .select("workspace_id, stripe_subscription_id, stripe_customer_id, current_period_end")
        .eq("status", "active")
        .gte("current_period_end", threeDaysStart.toISOString())
        .lte("current_period_end", threeDaysEnd.toISOString());

      if (subscriptions) {
        for (const sub of subscriptions) {
          // Check if reminder already sent
          const { data: existing } = await supabase
            .from("pre_bill_reminders")
            .select("id")
            .eq("subscription_id", sub.stripe_subscription_id)
            .eq("reminder_type", "email_3_days")
            .maybeSingle();

          if (!existing) {
            // Get workspace owner/user
            const { data: workspace } = await supabase
              .from("workspaces")
              .select("owner_id")
              .eq("id", sub.workspace_id)
              .maybeSingle();

            if (workspace?.owner_id) {
              const sent = await sendPreBillReminder(
                sub.workspace_id,
                workspace.owner_id,
                sub.stripe_subscription_id,
                new Date(sub.current_period_end)
              );
              if (sent) results.preBillReminders++;
            }
          }
        }
      }

      // Also check user-based subscriptions
      const { data: userSubscriptions } = await supabase
        .from("subscriptions")
        .select("user_id, stripe_subscription_id, stripe_customer_id, current_period_end")
        .eq("status", "active")
        .gte("current_period_end", threeDaysStart.toISOString())
        .lte("current_period_end", threeDaysEnd.toISOString());

      if (userSubscriptions) {
        for (const sub of userSubscriptions) {
          const { data: existing } = await supabase
            .from("pre_bill_reminders")
            .select("id")
            .eq("subscription_id", sub.stripe_subscription_id)
            .eq("reminder_type", "email_3_days")
            .maybeSingle();

          if (!existing) {
            // Get workspace_id from user's workspace membership
            const { data: membership } = await supabase
              .from("workspace_members")
              .select("workspace_id")
              .eq("user_id", sub.user_id)
              .limit(1)
              .maybeSingle();

            const workspaceId = membership?.workspace_id || null;
            const sent = await sendPreBillReminder(
              workspaceId || "00000000-0000-0000-0000-000000000000",
              sub.user_id,
              sub.stripe_subscription_id,
              new Date(sub.current_period_end)
            );
            if (sent) results.preBillReminders++;
          }
        }
      }
    } catch (error: any) {
      results.errors.push(`Pre-bill reminders error: ${error.message}`);
    }

    // ============================================================================
    // PHASE 2 — RECOVER: Process scheduled recovery actions
    // ============================================================================
    try {
      const { data: recoveryStates } = await supabase
        .from("billing_recovery_states")
        .select("*")
        .eq("recovery_phase", "recover")
        .lte("next_action_at", now.toISOString())
        .is("recovery_completed_at", null);

      if (recoveryStates) {
        for (const state of recoveryStates) {
          try {
            let sent = false;

            switch (state.recovery_stage) {
              case 0:
                // Stage 1: Immediate SMS
                sent = await sendRecoverySMSStage1(state.id);
                break;
              case 1:
                // Stage 2: Email #1 (1 hour after fail)
                sent = await sendRecoveryEmailStage2(state.id);
                break;
              case 2:
                // Stage 3: Email #2 (24 hours later)
                sent = await sendRecoveryEmailStage3(state.id);
                break;
              case 3:
                // Stage 4: Phone call (Day 2-3)
                sent = await scheduleRecoveryPhoneCall(state.id);
                break;
              case 4:
                // Stage 5: Final email (Day 5)
                sent = await sendRecoveryEmailStage5(state.id);
                break;
            }

            if (sent) results.recoveryActions++;
          } catch (error: any) {
            results.errors.push(`Recovery action error for ${state.id}: ${error.message}`);
          }
        }
      }
    } catch (error: any) {
      results.errors.push(`Recovery processing error: ${error.message}`);
    }

    // ============================================================================
    // PHASE 3 — WIN-BACK: Process scheduled win-back actions
    // ============================================================================
    try {
      const { data: winBackStates } = await supabase
        .from("billing_recovery_states")
        .select("*")
        .eq("recovery_phase", "win_back")
        .lte("next_action_at", now.toISOString())
        .is("recovery_completed_at", null);

      if (winBackStates) {
        for (const state of winBackStates) {
          try {
            let sent = false;

            switch (state.recovery_stage) {
              case 0:
                // Win-back Email #1 (Day 7)
                sent = await sendWinBackEmail1(state.id);
                break;
              case 1:
                // Win-back Email #2 (Day 10)
                sent = await sendWinBackEmail2(state.id);
                break;
              case 2:
                // Win-back SMS (Day 12)
                sent = await sendWinBackSMS(state.id);
                break;
            }

            if (sent) results.winBackActions++;
          } catch (error: any) {
            results.errors.push(`Win-back action error for ${state.id}: ${error.message}`);
          }
        }
      }
    } catch (error: any) {
      results.errors.push(`Win-back processing error: ${error.message}`);
    }

    // ============================================================================
    // Update churn prediction scores
    // ============================================================================
    try {
      const { data: activeRecoveryStates } = await supabase
        .from("billing_recovery_states")
        .select("id, workspace_id, user_id")
        .in("recovery_phase", ["recover", "win_back"])
        .is("recovery_completed_at", null);

      if (activeRecoveryStates) {
        for (const state of activeRecoveryStates) {
          const { data: stats } = await supabase.rpc("get_recovery_stats", {
            p_workspace_id: state.workspace_id || null,
            p_user_id: state.user_id,
          });

          if (stats && stats.length > 0) {
            const stat = stats[0];
            await supabase
              .from("billing_recovery_states")
              .update({
                engagement_score: stat.engagement_score || 0,
                campaign_activity_count: stat.campaign_activity_count || 0,
                last_campaign_activity_at: stat.last_campaign_activity_at,
                churn_score: Math.max(0, 100 - (stat.engagement_score || 0) - (stat.days_since_last_activity || 0) * 5),
              })
              .eq("id", state.id);
          }
        }
      }
    } catch (error: any) {
      results.errors.push(`Churn score update error: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: now.toISOString(),
    });
  } catch (error: any) {
    console.error("Billing recovery cron error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}






































