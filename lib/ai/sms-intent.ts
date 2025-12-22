// SMS Intent Classification
// Extends the email reply intent classifier for SMS messages

import { classifyReplyIntent, ReplyIntentLabel } from "./reply-intent";

export type SMSIntentLabel = ReplyIntentLabel | "opt_out";

export interface SMSIntentResult {
  label: SMSIntentLabel;
  confidence: number; // 0–1
  reason: string;
}

/**
 * Classify SMS reply intent
 * Uses the same AI pipeline as email replies but adapted for SMS context
 */
export async function classifySMSIntent(args: {
  body: string;
}): Promise<SMSIntentResult> {
  const { body } = args;

  // Quick check for opt-out keywords first
  const optOutKeywords = ["stop", "stopall", "cancel", "end", "quit", "unsubscribe"];
  const normalizedBody = body.toLowerCase().trim();
  
  for (const keyword of optOutKeywords) {
    if (normalizedBody === keyword || normalizedBody.startsWith(keyword + " ")) {
      return {
        label: "opt_out",
        confidence: 0.95,
        reason: `Detected opt-out keyword: ${keyword}`,
      };
    }
  }

  // Use the email reply intent classifier (it works well for SMS too)
  const emailResult = await classifyReplyIntent({
    subject: null, // SMS doesn't have subjects
    body: body,
  });

  // Map email intents to SMS intents (they're mostly the same)
  return {
    label: emailResult.label as SMSIntentLabel,
    confidence: emailResult.confidence,
    reason: emailResult.reason,
  };
}




























































