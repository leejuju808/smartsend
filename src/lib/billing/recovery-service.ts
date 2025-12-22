/**
 * Block 23690 — SmartSend Roofing Payment Recovery Service
 * Handles all recovery actions: emails, SMS, phone calls, win-back sequences
 */

import { createClient } from "@supabase/supabase-js";
import { sendSMS } from "@/lib/providers/sms";
import { sendEmailNotification } from "@/lib/notifications/email";
import Stripe from "stripe";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

interface RecoveryState {
  id: string;
  workspace_id?: string;
  user_id: string;
  subscription_id?: string;
  stripe_customer_id: string;
  recovery_phase: string;
  recovery_stage: number;
  billing_failed_at: string;
  first_failure_at: string;
}

interface UserInfo {
  email: string;
  phone?: string;
  name?: string;
}

/**
 * Get user info (email, phone, name) for recovery
 */
async function getUserInfo(userId: string, workspaceId?: string): Promise<UserInfo | null> {
  // Try to get from profiles
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, phone, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (profile) {
    return {
      email: profile.email,
      phone: profile.phone || undefined,
      name: profile.full_name || undefined,
    };
  }

  // Fallback to auth.users
  const { data: { user } } = await supabase.auth.admin.getUserById(userId);
  if (user) {
    return {
      email: user.email || "",
      phone: user.phone || undefined,
      name: user.user_metadata?.full_name || user.user_metadata?.name,
    };
  }

  return null;
}

/**
 * Create billing update link (Stripe Customer Portal)
 */
async function createBillingUpdateLink(
  recoveryStateId: string,
  stripeCustomerId: string
): Promise<string> {
  // Create secure token link
  const { data: linkData, error } = await supabase.rpc("create_billing_update_link", {
    p_recovery_state_id: recoveryStateId,
    p_stripe_customer_id: stripeCustomerId,
    p_expires_hours: 168, // 7 days
  });

  if (error || !linkData) {
    // Fallback: create Stripe billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${APP_URL}/settings?section=billing`,
    });
    return session.url;
  }

  // Return link with token
  return `${APP_URL}/billing/update?token=${linkData}`;
}

/**
 * PHASE 1 — PREVENT: Pre-Bill Reminder (3 days before renewal)
 */
export async function sendPreBillReminder(
  workspaceId: string,
  userId: string,
  subscriptionId: string,
  renewalDate: Date
): Promise<boolean> {
  try {
    const userInfo = await getUserInfo(userId, workspaceId);
    if (!userInfo?.email) return false;

    const renewalDateStr = renewalDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const subject = "Your SmartSend subscription renews soon";
    const body = `Just a quick heads up — your SmartSend plan will renew on ${renewalDateStr}.

No action needed unless you want to update your card.
Your campaigns will continue running automatically.`;

    // Create notification first
    const { data: notification } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        type: "billing_reminder",
        title: subject,
        body,
        read: false,
      })
      .select()
      .single();

    if (notification) {
      // Send email
      await sendEmailNotification({
        userId,
        notificationId: notification.id,
        type: "billing_reminder",
        title: subject,
        body,
      });
    }

    // Log reminder
    await supabase.from("pre_bill_reminders").insert({
      workspace_id: workspaceId,
      user_id: userId,
      subscription_id: subscriptionId,
      renewal_date: renewalDate.toISOString(),
      reminder_type: "email_3_days",
      sent_at: new Date().toISOString(),
    });

    return true;
  } catch (error) {
    console.error("Error sending pre-bill reminder:", error);
    return false;
  }
}

/**
 * PHASE 2 — RECOVER: Stage 1 — Immediate SMS (Within 5 Minutes)
 */
export async function sendRecoverySMSStage1(recoveryStateId: string): Promise<boolean> {
  try {
    const { data: state } = await supabase
      .from("billing_recovery_states")
      .select("*")
      .eq("id", recoveryStateId)
      .single();

    if (!state) return false;

    const userInfo = await getUserInfo(state.user_id, state.workspace_id || undefined);
    if (!userInfo?.phone) return false;

    const updateLink = await createBillingUpdateLink(recoveryStateId, state.stripe_customer_id);

    const message = `Hey this is Julian from SmartSend — your card didn't go through.

No stress — here's the link to update it so your campaigns don't pause:
${updateLink}`;

    // Send SMS
    const smsResult = await sendSMS(userInfo.phone, message, {
      provider: "twilio",
      credentials: {
        accountSid: process.env.TWILIO_ACCOUNT_SID!,
        authToken: process.env.TWILIO_AUTH_TOKEN!,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER!,
      },
    });

    if (smsResult.success) {
      // Log event
      await supabase.rpc("log_recovery_event", {
        p_recovery_state_id: recoveryStateId,
        p_event_type: "sms_stage_1",
        p_channel: "sms",
        p_message: message,
        p_metadata: {
          provider_message_id: smsResult.providerMessageId,
          sent_at: new Date().toISOString(),
        },
      });

      // Update recovery state
      await supabase
        .from("billing_recovery_states")
        .update({
          recovery_stage: 1,
          next_action_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour later
        })
        .eq("id", recoveryStateId);

      return true;
    }

    return false;
  } catch (error) {
    console.error("Error sending recovery SMS stage 1:", error);
    return false;
  }
}

/**
 * PHASE 2 — RECOVER: Stage 2 — Email #1 (1 hour after fail)
 */
export async function sendRecoveryEmailStage2(recoveryStateId: string): Promise<boolean> {
  try {
    const { data: state } = await supabase
      .from("billing_recovery_states")
      .select("*")
      .eq("id", recoveryStateId)
      .single();

    if (!state) return false;

    const userInfo = await getUserInfo(state.user_id, state.workspace_id || undefined);
    if (!userInfo?.email) return false;

    const updateLink = await createBillingUpdateLink(recoveryStateId, state.stripe_customer_id);

    const subject = "Quick fix to keep SmartSend running";
    const body = `Your SmartSend payment didn't go through.
This can happen if a card expired or got replaced.

Update your card here to keep your campaigns active:
${updateLink}

As soon as it's updated, everything continues normally.`;

    // Create notification first
    const { data: notification } = await supabase
      .from("notifications")
      .insert({
        user_id: state.user_id,
        workspace_id: state.workspace_id || undefined,
        type: "billing_recovery",
        title: subject,
        body,
        read: false,
      })
      .select()
      .single();

    if (notification) {
      // Send email
      await sendEmailNotification({
        userId: state.user_id,
        notificationId: notification.id,
        type: "billing_recovery",
        title: subject,
        body,
      });
    }

    // Log event
    await supabase.rpc("log_recovery_event", {
      p_recovery_state_id: recoveryStateId,
      p_event_type: "email_stage_2",
      p_channel: "email",
      p_subject: subject,
      p_message: body,
    });

    // Update recovery state
    await supabase
      .from("billing_recovery_states")
      .update({
        recovery_stage: 2,
        next_action_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours later
      })
      .eq("id", recoveryStateId);

    return true;
  } catch (error) {
    console.error("Error sending recovery email stage 2:", error);
    return false;
  }
}

/**
 * PHASE 2 — RECOVER: Stage 3 — Email #2 (24 hours later, urgent)
 */
export async function sendRecoveryEmailStage3(recoveryStateId: string): Promise<boolean> {
  try {
    const { data: state } = await supabase
      .from("billing_recovery_states")
      .select("*")
      .eq("id", recoveryStateId)
      .single();

    if (!state) return false;

    const userInfo = await getUserInfo(state.user_id, state.workspace_id || undefined);
    if (!userInfo?.email) return false;

    const updateLink = await createBillingUpdateLink(recoveryStateId, state.stripe_customer_id);

    const subject = "Your SmartSend campaigns will pause";
    const body = `Just a heads up — your SmartSend campaigns will pause tomorrow if the card isn't updated.

Here's the link to fix it (takes 10 seconds):
${updateLink}

Don't lose momentum — you've already paid for leads; let's keep them flowing.`;

    // Create notification first
    const { data: notification } = await supabase
      .from("notifications")
      .insert({
        user_id: state.user_id,
        workspace_id: state.workspace_id || undefined,
        type: "billing_recovery",
        title: subject,
        body,
        read: false,
      })
      .select()
      .single();

    if (notification) {
      // Send email
      await sendEmailNotification({
        userId: state.user_id,
        notificationId: notification.id,
        type: "billing_recovery",
        title: subject,
        body,
      });
    }

    // Log event
    await supabase.rpc("log_recovery_event", {
      p_recovery_state_id: recoveryStateId,
      p_event_type: "email_stage_3",
      p_channel: "email",
      p_subject: subject,
      p_message: body,
    });

    // Update recovery state
    await supabase
      .from("billing_recovery_states")
      .update({
        recovery_stage: 3,
        next_action_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days later
      })
      .eq("id", recoveryStateId);

    return true;
  } catch (error) {
    console.error("Error sending recovery email stage 3:", error);
    return false;
  }
}

/**
 * PHASE 2 — RECOVER: Stage 4 — Phone Call or Voice Note (Day 2-3)
 * Note: This creates a task/notification for manual follow-up
 */
export async function scheduleRecoveryPhoneCall(recoveryStateId: string): Promise<boolean> {
  try {
    const { data: state } = await supabase
      .from("billing_recovery_states")
      .select("*")
      .eq("id", recoveryStateId)
      .single();

    if (!state) return false;

    const userInfo = await getUserInfo(state.user_id, state.workspace_id || undefined);
    if (!userInfo) return false;

    const updateLink = await createBillingUpdateLink(recoveryStateId, state.stripe_customer_id);

    // Create a task/notification for manual phone call
    // In a real implementation, this could trigger a call via Twilio Voice API
    const script = `Hey brother, it's Julian. Your SmartSend card failed — want me to text the update link?
We don't want your campaigns to pause and miss homeowner replies.

Update link: ${updateLink}`;

    // Log event (marking as phone call scheduled)
    await supabase.rpc("log_recovery_event", {
      p_recovery_state_id: recoveryStateId,
      p_event_type: "phone_call_stage_4",
      p_channel: "phone",
      p_message: script,
      p_metadata: {
        scheduled: true,
        phone: userInfo.phone,
      },
    });

    // Update recovery state
    await supabase
      .from("billing_recovery_states")
      .update({
        recovery_stage: 4,
        next_action_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days later
      })
      .eq("id", recoveryStateId);

    return true;
  } catch (error) {
    console.error("Error scheduling recovery phone call:", error);
    return false;
  }
}

/**
 * PHASE 2 — RECOVER: Stage 5 — Final Email (Day 5)
 */
export async function sendRecoveryEmailStage5(recoveryStateId: string): Promise<boolean> {
  try {
    const { data: state } = await supabase
      .from("billing_recovery_states")
      .select("*")
      .eq("id", recoveryStateId)
      .single();

    if (!state) return false;

    const userInfo = await getUserInfo(state.user_id, state.workspace_id || undefined);
    if (!userInfo?.email) return false;

    const updateLink = await createBillingUpdateLink(recoveryStateId, state.stripe_customer_id);

    const subject = "Should I pause your SmartSend account?";
    const body = `Before I pause everything, wanted to check —

Do you want SmartSend to keep running your outreach and follow-up?

If yes, update your card here:
${updateLink}

If not, just reply 'pause' and I'll stop everything.`;

    // Create notification first
    const { data: notification } = await supabase
      .from("notifications")
      .insert({
        user_id: state.user_id,
        workspace_id: state.workspace_id || undefined,
        type: "billing_recovery",
        title: subject,
        body,
        read: false,
      })
      .select()
      .single();

    if (notification) {
      // Send email
      await sendEmailNotification({
        userId: state.user_id,
        notificationId: notification.id,
        type: "billing_recovery",
        title: subject,
        body,
      });
    }

    // Log event
    await supabase.rpc("log_recovery_event", {
      p_recovery_state_id: recoveryStateId,
      p_event_type: "email_stage_5",
      p_channel: "email",
      p_subject: subject,
      p_message: body,
    });

    // Update recovery state
    await supabase
      .from("billing_recovery_states")
      .update({
        recovery_stage: 5,
        next_action_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days later (move to win-back)
        recovery_phase: "win_back",
      })
      .eq("id", recoveryStateId);

    return true;
  } catch (error) {
    console.error("Error sending recovery email stage 5:", error);
    return false;
  }
}

/**
 * PHASE 3 — WIN-BACK: Email #1 (Day 7)
 */
export async function sendWinBackEmail1(recoveryStateId: string): Promise<boolean> {
  try {
    const { data: state } = await supabase
      .from("billing_recovery_states")
      .select("*")
      .eq("id", recoveryStateId)
      .single();

    if (!state) return false;

    const userInfo = await getUserInfo(state.user_id, state.workspace_id || undefined);
    if (!userInfo?.email) return false;

    const updateLink = await createBillingUpdateLink(recoveryStateId, state.stripe_customer_id);

    const subject = "Before I close your account…";
    const body = `I'm about to shut down your SmartSend campaigns.
Before I do, want me to run one last revival campaign for you?
If it books an estimate, we can reactivate your plan.

Update your card here: ${updateLink}`;

    // Create notification first
    const { data: notification } = await supabase
      .from("notifications")
      .insert({
        user_id: state.user_id,
        workspace_id: state.workspace_id || undefined,
        type: "billing_win_back",
        title: subject,
        body,
        read: false,
      })
      .select()
      .single();

    if (notification) {
      // Send email
      await sendEmailNotification({
        userId: state.user_id,
        notificationId: notification.id,
        type: "billing_win_back",
        title: subject,
        body,
      });
    }

    // Log event
    await supabase.rpc("log_recovery_event", {
      p_recovery_state_id: recoveryStateId,
      p_event_type: "win_back_email_1",
      p_channel: "email",
      p_subject: subject,
      p_message: body,
    });

    // Update recovery state
    await supabase
      .from("billing_recovery_states")
      .update({
        recovery_stage: 1,
        next_action_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days later
      })
      .eq("id", recoveryStateId);

    return true;
  } catch (error) {
    console.error("Error sending win-back email 1:", error);
    return false;
  }
}

/**
 * PHASE 3 — WIN-BACK: Email #2 (Day 10)
 */
export async function sendWinBackEmail2(recoveryStateId: string): Promise<boolean> {
  try {
    const { data: state } = await supabase
      .from("billing_recovery_states")
      .select("*")
      .eq("id", recoveryStateId)
      .single();

    if (!state) return false;

    const userInfo = await getUserInfo(state.user_id, state.workspace_id || undefined);
    if (!userInfo?.email) return false;

    const updateLink = await createBillingUpdateLink(recoveryStateId, state.stripe_customer_id);

    const subject = "Quick question";
    const body = `Were you still wanting SmartSend to handle follow-up for you?
If not, I'll fully close it out.

If yes, update your card here: ${updateLink}`;

    // Create notification first
    const { data: notification } = await supabase
      .from("notifications")
      .insert({
        user_id: state.user_id,
        workspace_id: state.workspace_id || undefined,
        type: "billing_win_back",
        title: subject,
        body,
        read: false,
      })
      .select()
      .single();

    if (notification) {
      // Send email
      await sendEmailNotification({
        userId: state.user_id,
        notificationId: notification.id,
        type: "billing_win_back",
        title: subject,
        body,
      });
    }

    // Log event
    await supabase.rpc("log_recovery_event", {
      p_recovery_state_id: recoveryStateId,
      p_event_type: "win_back_email_2",
      p_channel: "email",
      p_subject: subject,
      p_message: body,
    });

    // Update recovery state
    await supabase
      .from("billing_recovery_states")
      .update({
        recovery_stage: 2,
        next_action_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days later
      })
      .eq("id", recoveryStateId);

    return true;
  } catch (error) {
    console.error("Error sending win-back email 2:", error);
    return false;
  }
}

/**
 * PHASE 3 — WIN-BACK: SMS (Day 12)
 */
export async function sendWinBackSMS(recoveryStateId: string): Promise<boolean> {
  try {
    const { data: state } = await supabase
      .from("billing_recovery_states")
      .select("*")
      .eq("id", recoveryStateId)
      .single();

    if (!state) return false;

    const userInfo = await getUserInfo(state.user_id, state.workspace_id || undefined);
    if (!userInfo?.phone) return false;

    const updateLink = await createBillingUpdateLink(recoveryStateId, state.stripe_customer_id);

    const message = `Want me to restart your SmartSend campaigns? Updating the card takes 10 seconds.

${updateLink}`;

    // Send SMS
    const smsResult = await sendSMS(userInfo.phone, message, {
      provider: "twilio",
      credentials: {
        accountSid: process.env.TWILIO_ACCOUNT_SID!,
        authToken: process.env.TWILIO_AUTH_TOKEN!,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER!,
      },
    });

    if (smsResult.success) {
      // Log event
      await supabase.rpc("log_recovery_event", {
        p_recovery_state_id: recoveryStateId,
        p_event_type: "win_back_sms",
        p_channel: "sms",
        p_message: message,
        p_metadata: {
          provider_message_id: smsResult.providerMessageId,
        },
      });

      // Update recovery state
      await supabase
        .from("billing_recovery_states")
        .update({
          recovery_stage: 3,
          next_action_at: null, // Final attempt
        })
        .eq("id", recoveryStateId);

      return true;
    }

    return false;
  } catch (error) {
    console.error("Error sending win-back SMS:", error);
    return false;
  }
}

/**
 * Lock send queue when billing fails
 */
export async function lockSendQueue(workspaceId: string, userId: string): Promise<boolean> {
  try {
    // Pause all active campaigns
    await supabase
      .from("campaigns")
      .update({ status: "paused" })
      .eq("user_id", userId)
      .in("status", ["running", "sending", "active"]);

    // Also pause by workspace_id if available
    if (workspaceId) {
      await supabase
        .from("campaigns")
        .update({ status: "paused" })
        .eq("workspace_id", workspaceId)
        .in("status", ["running", "sending", "active"]);
    }

    return true;
  } catch (error) {
    console.error("Error locking send queue:", error);
    return false;
  }
}

/**
 * Unlock send queue when payment succeeds
 */
export async function unlockSendQueue(workspaceId: string, userId: string): Promise<boolean> {
  try {
    // Reactivate campaigns that were paused due to billing
    await supabase
      .from("campaigns")
      .update({ status: "running" })
      .eq("user_id", userId)
      .eq("status", "paused");

    if (workspaceId) {
      await supabase
        .from("campaigns")
        .update({ status: "running" })
        .eq("workspace_id", workspaceId)
        .eq("status", "paused");
    }

    // Clear recovery state
    await supabase
      .from("billing_recovery_states")
      .update({
        recovery_phase: "none",
        recovery_stage: 0,
        send_queue_locked: false,
        billing_failed_tag_applied: false,
        recovery_completed_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return true;
  } catch (error) {
    console.error("Error unlocking send queue:", error);
    return false;
  }
}

