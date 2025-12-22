"use server";

import { createClient } from "@/lib/supabase/server";

// Define the ReplyIntent type based on the existing system
export type ReplyIntent = 
  | 'meeting'
  | 'positive' 
  | 'neutral'
  | 'not_interested'
  | 'unsubscribe'
  | 'complaint'
  | 'bounce_hard'
  | 'bounce_soft';

// Map reply intents to suppression reasons
function mapIntentToSuppression(intent: ReplyIntent): string | null {
  switch (intent) {
    case 'unsubscribe':
      return 'unsubscribed';
    case 'complaint':
      return 'complaint';
    case 'bounce_hard':
    case 'bounce_soft':
      return 'bounced';
    case 'not_interested':
      // Don't auto-suppress for not_interested, let users decide
      return null;
    default:
      return null;
  }
}

/**
 * Server Action: handleReplyIntent
 * - Logs the reply intent (for analytics)
 * - If negative + flag ON, upserts into suppressions
 * - If "meeting", records a meeting row (for MB/100 numerator)
 */
export async function handleReplyIntent(params: {
  workspaceId: string;
  email: string;
  intent: ReplyIntent;
  metadata?: Record<string, any>;
}) {
  const { workspaceId, email, intent, metadata = {} } = params;
  const supabase = createClient();

  // Fetch profile flags (we also need them later)
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("workspace_id, auto_suppress_negatives")
    .eq("workspace_id", workspaceId)
    .limit(1)
    .maybeSingle();

  if (profErr) {
    return { ok: false, suppressed: false, reason: null, error: profErr.message };
  }
  if (!profile) {
    return { ok: false, suppressed: false, reason: null, error: "Profile not found for workspace." };
  }

  // 1) Log the reply intent (analytics)
  const logRow = {
    workspace_id: workspaceId,
    email: email.trim().toLowerCase(),
    intent,
    metadata
  };
  // Ignore RLS/unique concerns; it's an event log
  const { error: logErr } = await supabase.from("reply_intents").insert(logRow);
  if (logErr) {
    // Non-fatal
    console.error("reply_intents insert error:", logErr.message);
  }

  // 2) Meeting capture for MB/100 numerator
  if (intent === "meeting") {
    const { error: meetErr } = await supabase.from("meetings").insert({
      workspace_id: workspaceId,
      email: email.trim().toLowerCase(),
      source: "reply_intent"
    });
    if (meetErr) {
      console.error("meetings insert error:", meetErr.message);
    }
  }

  // 3) Negative → suppression (if enabled)
  const suppressionReason = mapIntentToSuppression(intent);
  if (profile.auto_suppress_negatives && suppressionReason) {
    const { error: insErr } = await supabase.from("suppressions").insert({
      workspace_id: workspaceId,
      email: email.trim().toLowerCase(),
      reason: suppressionReason,
      metadata: { source: "reply_intent", intent, ...metadata },
    });
    if (insErr && !/duplicate key|unique constraint/i.test(insErr.message)) {
      return { ok: false, suppressed: false, reason: null, error: insErr.message };
    }
    return { ok: true, suppressed: true, reason: suppressionReason };
  }

  return { ok: true, suppressed: false, reason: null };
}