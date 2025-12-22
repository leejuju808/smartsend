// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailViaProvider, type Provider } from "../_shared/senders.ts";
import { ensureFreshToken, type Conn } from "../_shared/oauth.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async () => {
  try {
    console.log("Starting warmup dispatcher...");

    const now = new Date().toISOString();

    // Fetch due warmup emails
    const { data: due, error: fetchError } = await supabase
      .from("warmup_queue")
      .select("*")
      .lte("scheduled_for", now)
      .is("sent_at", null)
      .limit(20);

    if (fetchError) {
      console.error("Error fetching due warmup emails:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!due || due.length === 0) {
      console.log("No due warmup emails");
      return new Response(
        JSON.stringify({ ok: true, sent: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let sentCount = 0;
    let errorCount = 0;

    for (const w of due) {
      try {
        // Fetch inbox OAuth credentials
        const { data: inbox, error: inboxError } = await supabase
          .from("sender_inboxes")
          .select("id, email, provider, oauth_token")
          .eq("id", w.inbox_id)
          .single();

        if (inboxError || !inbox) {
          console.error(`Error fetching inbox ${w.inbox_id}:`, inboxError);
          errorCount++;
          continue;
        }

        // Get target inbox email
        const { data: targetInbox, error: targetError } = await supabase
          .from("sender_inboxes")
          .select("email")
          .eq("id", w.target_inbox_id)
          .single();

        if (targetError || !targetInbox) {
          console.error(`Error fetching target inbox ${w.target_inbox_id}:`, targetError);
          errorCount++;
          continue;
        }

        // Extract OAuth token from jsonb
        const oauthToken = inbox.oauth_token as any;
        if (!oauthToken || !oauthToken.access_token) {
          console.error(`No OAuth token for inbox ${w.inbox_id}`);
          errorCount++;
          continue;
        }

        // Create connection object for sending
        const account: Conn = {
          id: inbox.id,
          provider: inbox.provider as Provider,
          access_token: oauthToken.access_token,
          refresh_token: oauthToken.refresh_token || null,
          expires_at: oauthToken.expires_at || null,
          email: inbox.email,
          cooldown_until: null,
          meta: {},
        };

        // Ensure fresh token
        const freshAccount = await ensureFreshToken(account);

        // Send email
        const sendResult = await sendEmailViaProvider(freshAccount.provider, {
          account: freshAccount,
          to: targetInbox.email,
          subject: w.subject,
          html: `<p>${w.body}</p>`,
          text: w.body,
        });

        if (!sendResult.ok) {
          console.error(`Failed to send warmup email ${w.id}:`, sendResult.errorCode);
          errorCount++;
          continue;
        }

        // Mark as sent
        const { error: updateError } = await supabase
          .from("warmup_queue")
          .update({ sent_at: new Date().toISOString() })
          .eq("id", w.id);

        if (updateError) {
          console.error(`Error updating warmup_queue ${w.id}:`, updateError);
        } else {
          sentCount++;
          
          // Block 451 v2: Realistic reply simulation with variable delay (5-120 minutes)
          // Schedule reply for later instead of immediate
          const replyDelayMinutes = Math.floor(Math.random() * 115) + 5; // 5-120 minutes
          const replyScheduledFor = new Date(Date.now() + replyDelayMinutes * 60 * 1000);
          
          // Store reply scheduling info (we'll process replies in a separate cron)
          // For now, we'll create a scheduled reply task
          await supabase
            .from("warmup_queue")
            .update({ 
              reply_scheduled_for: replyScheduledFor.toISOString(),
              // Mark as "opened" immediately (simulating email open)
              opened_at: new Date().toISOString()
            })
            .eq("id", w.id);
        }

        // Update OAuth token if refreshed
        if (freshAccount.access_token !== account.access_token) {
          await supabase
            .from("sender_inboxes")
            .update({
              oauth_token: {
                access_token: freshAccount.access_token,
                refresh_token: freshAccount.refresh_token || oauthToken.refresh_token,
                expires_at: freshAccount.expires_at,
              },
            })
            .eq("id", inbox.id);
        }
      } catch (error: any) {
        console.error(`Error processing warmup email ${w.id}:`, error);
        errorCount++;
      }
    }

    console.log(`Sent ${sentCount} warmup emails, ${errorCount} errors`);

    return new Response(
      JSON.stringify({ ok: true, sent: sentCount, errors: errorCount }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in warmup-dispatcher:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

