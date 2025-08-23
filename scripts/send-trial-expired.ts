#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY!);

async function main() {
  const now = new Date();
  logger.info({ event: 'trial_expired_start', timestamp: now.toISOString() });

  // Find trials that ended yesterday → status should now be 'free'
  // We look for profiles that:
  // 1. Have subscription_status = 'free' (trial ended)
  // 2. Have trial_end <= now (trial has actually ended)
  // 3. Haven't been sent a trial expired email yet
  const { data: rows, error } = await supabase
    .from("profiles")
    .select("id, email, trial_end, subscription_status")
    .eq("subscription_status", "free")
    .not("trial_end", "is", null)
    .lte("trial_end", now.toISOString());

  if (error) {
    logger.error({ event: 'trial_expired_query_error', error: error.message });
    throw error;
  }

  logger.info({ event: 'trial_expired_found', count: rows?.length || 0 });

  let sentCount = 0;
  let skippedCount = 0;

  for (const row of rows || []) {
    // Skip if already emailed
    const { data: already } = await supabase
      .from("trial_emails")
      .select("id")
      .eq("user_id", row.id)
      .eq("type", "trial_expired")
      .maybeSingle();

    if (already) {
      skippedCount++;
      logger.debug({ event: 'trial_expired_already_sent', user_id: row.id });
      continue;
    }

    try {
      // Send the trial expired email
      await resend.emails.send({
        from: process.env.RESEND_FROM!,
        to: row.email,
        subject: "Your SmartSendAI trial has ended",
        text: `
Hi ${row.email},

Your SmartSendAI trial just ended. Don't lose the campaigns, AI replies, and automations you've set up.

Upgrade today to keep everything running:
${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing

– The SmartSendAI Team
        `.trim(),
      });

      // Record that we sent the email
      await supabase.from("trial_emails").insert({
        user_id: row.id,
        email: row.email,
        type: "trial_expired"
      });

      sentCount++;
      logger.info({ event: 'trial_expired_email_sent', user_id: row.id, email: row.email });

    } catch (emailError) {
      logger.error({ 
        event: 'trial_expired_email_error', 
        user_id: row.id, 
        email: row.email, 
        error: emailError instanceof Error ? emailError.message : 'Unknown error'
      });
    }
  }

  logger.info({ 
    event: 'trial_expired_complete', 
    sent: sentCount, 
    skipped: skippedCount, 
    total: rows?.length || 0 
  });
}

main().catch(async (e) => {
  try {
    logger.error({ event: 'trial_expired_error', message: e?.message, stack: e?.stack });
  } catch {
    // best-effort fallback
    console.error(e);
  }
  process.exit(1);
}); 