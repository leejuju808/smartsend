// supabase/functions/smartsend_warmup_worker/index.ts
// SmartSend Warmup Worker - Runs every 15-60 minutes via Supabase cron
// Sends warmup emails for enabled accounts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";
import { sendEmail } from "../_shared/sendEmail.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

// Simple helper: today yyyy-mm-dd
function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

async function generateWarmupEmail(fromEmail: string) {
  const prompt = `
You are SmartSend. Generate a short, natural-looking email that could be used for mailbox warmup.

Keep it generic (no real offers), friendly, and under 80 words.

Return JSON:
{
  "subject": "...",
  "body": "..."
}
`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });

    const content = res.choices[0].message.content;
    if (!content) {
      throw new Error("No content from OpenAI");
    }

    const parsed = JSON.parse(content);

    return {
      subject: parsed.subject || "Quick check-in",
      body: parsed.body || "Just checking everything is working fine on my end.",
    };
  } catch (error) {
    console.error("Error generating warmup email:", error);
    // Fallback to simple template
    return {
      subject: "Quick check-in",
      body: "Just checking everything is working fine on my end. Hope you're doing well!",
    };
  }
}

async function findAccountByEmail(fromEmail: string, userId: string) {
  // Try to find connected_accounts by email and user_id
  const { data: accounts, error } = await supabase
    .from("connected_accounts")
    .select("id, provider, email, email_address")
    .or(`email.eq.${fromEmail},email_address.eq.${fromEmail}`)
    .eq("user_id", userId)
    .limit(1);

  if (error || !accounts || accounts.length === 0) {
    return null;
  }

  const account = accounts[0];
  return {
    account_id: account.id,
    provider: account.provider as "gmail" | "outlook",
  };
}

Deno.serve(async () => {
  try {
    const today = todayISODate();

    // 1) Load enabled warmup accounts
    const { data: accounts, error: accErr } = await supabase
      .from("smartsend_warmup_accounts")
      .select("*")
      .eq("is_enabled", true);

    if (accErr) {
      console.error("Error loading warmup accounts:", accErr);
      return new Response(JSON.stringify({ error: accErr.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No warmup accounts enabled" }),
        { headers: { "content-type": "application/json" } }
      );
    }

    let processed = 0;
    let sent = 0;
    let errors = 0;

    for (const acc of accounts) {
      try {
        // Reset daily counters if it's a new day
        if (!acc.last_sent_date || acc.last_sent_date !== today) {
          await supabase
            .from("smartsend_warmup_accounts")
            .update({
              last_sent_date: today,
              sent_today: 0,
            })
            .eq("id", acc.id);

          acc.sent_today = 0;
          acc.last_sent_date = today;
        }

        // Determine today's quota
        let currentPerDay = acc.current_per_day || acc.start_per_day || 5;

        // Clamp within [start_per_day, max_per_day]
        if (currentPerDay < acc.start_per_day) {
          currentPerDay = acc.start_per_day;
        }
        if (currentPerDay > acc.max_per_day) {
          currentPerDay = acc.max_per_day;
        }

        const remaining = currentPerDay - (acc.sent_today || 0);
        if (remaining <= 0) {
          processed++;
          continue;
        }

        // Find account details for sending
        const accountInfo = await findAccountByEmail(acc.from_email, acc.user_id);
        if (!accountInfo) {
          console.error(`No connected account found for ${acc.from_email}`);
          await supabase.from("smartsend_warmup_logs").insert({
            warmup_account_id: acc.id,
            from_email: acc.from_email,
            to_email: acc.from_email, // sending to self
            status: "failed",
            error: `No connected account found for ${acc.from_email}`,
          });
          errors++;
          continue;
        }

        // Warmup target: for MVP, send to same mailbox (loop), or a simple echo address
        const toEmail = acc.from_email; // sending to self is enough for basic warmup

        // Send up to remaining emails
        let sentCount = 0;
        for (let i = 0; i < remaining && i < 5; i++) {
          // Limit batch size to 5 per run to avoid rate limits
          try {
            const { subject, body } = await generateWarmupEmail(acc.from_email);

            // Convert body to HTML (simple conversion)
            const bodyHtml = body.replace(/\n/g, "<br>");

            // Send email using shared sendEmail function
            const sendResult = await sendEmail({
              provider: accountInfo.provider,
              to: toEmail,
              subject: subject,
              body_html: bodyHtml,
              account_id: accountInfo.account_id,
            });

            if (sendResult.success) {
              // Log success
              await supabase.from("smartsend_warmup_logs").insert({
                warmup_account_id: acc.id,
                from_email: acc.from_email,
                to_email: toEmail,
                subject: subject,
                body: body,
                status: "sent",
                sent_at: new Date().toISOString(),
              });

              sentCount++;
              sent++;
            } else {
              // Log failure
              await supabase.from("smartsend_warmup_logs").insert({
                warmup_account_id: acc.id,
                from_email: acc.from_email,
                to_email: toEmail,
                subject: subject,
                body: body,
                status: "failed",
                error: sendResult.error || "Send failed",
              });
              errors++;
            }
          } catch (err) {
            console.error(`Error sending warmup email ${i + 1} for ${acc.from_email}:`, err);
            await supabase.from("smartsend_warmup_logs").insert({
              warmup_account_id: acc.id,
              from_email: acc.from_email,
              to_email: toEmail,
              status: "failed",
              error: err instanceof Error ? err.message : String(err),
            });
            errors++;
          }

          // Small delay between sends to avoid rate limits
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        // Update sent_today counter
        if (sentCount > 0) {
          await supabase
            .from("smartsend_warmup_accounts")
            .update({
              sent_today: (acc.sent_today || 0) + sentCount,
            })
            .eq("id", acc.id);
        }

        // Optional ramp logic: if we've hit today's quota and still below max, bump for tomorrow
        const newSentToday = (acc.sent_today || 0) + sentCount;
        if (newSentToday >= currentPerDay && currentPerDay < acc.max_per_day) {
          const newCurrentPerDay = Math.min(
            currentPerDay + acc.ramp_per_day,
            acc.max_per_day
          );
          await supabase
            .from("smartsend_warmup_accounts")
            .update({
              current_per_day: newCurrentPerDay,
            })
            .eq("id", acc.id);
        }

        processed++;
      } catch (err) {
        console.error(`Error processing warmup account ${acc.id}:`, err);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        sent,
        errors,
        message: `Processed ${processed} accounts, sent ${sent} emails`,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    console.error("Warmup worker error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
});








