// Block 451 — Inbox Warmup v2: Reply Simulator
// Processes scheduled warmup replies with realistic timing

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
    console.log("Starting warmup reply simulator...");

    const now = new Date().toISOString();

    // Fetch warmup emails that are due for reply
    const { data: dueReplies, error: fetchError } = await supabase
      .from("warmup_queue")
      .select("*")
      .lte("reply_scheduled_for", now)
      .is("replied_at", null)
      .not("sent_at", "is", null)
      .limit(20);

    if (fetchError) {
      console.error("Error fetching due replies:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!dueReplies || dueReplies.length === 0) {
      console.log("No due warmup replies");
      return new Response(
        JSON.stringify({ ok: true, replied: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let repliedCount = 0;
    let errorCount = 0;

    for (const w of dueReplies) {
      try {
        // Get target inbox (the one that should send the reply)
        const { data: targetInbox, error: targetError } = await supabase
          .from("sender_inboxes")
          .select("id, email, provider, oauth_token")
          .eq("id", w.target_inbox_id)
          .single();

        if (targetError || !targetInbox) {
          console.error(`Error fetching target inbox ${w.target_inbox_id}:`, targetError);
          errorCount++;
          continue;
        }

        // Get sender inbox email
        const { data: senderInbox, error: senderError } = await supabase
          .from("sender_inboxes")
          .select("email")
          .eq("id", w.inbox_id)
          .single();

        if (senderError || !senderInbox) {
          console.error(`Error fetching sender inbox ${w.inbox_id}:`, senderError);
          errorCount++;
          continue;
        }

        // Extract OAuth token
        const oauthToken = targetInbox.oauth_token as any;
        if (!oauthToken || !oauthToken.access_token) {
          console.error(`No OAuth token for target inbox ${w.target_inbox_id}`);
          errorCount++;
          continue;
        }

        // Generate reply content
        let replySubject = `Re: ${w.subject}`;
        let replyBody = w.reply_body;

        if (!replyBody) {
          // Generate reply using content generator
          try {
            const contentResponse = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/warmup-content-generator`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({
                  inbox_id: w.target_inbox_id,
                  target_inbox_id: w.inbox_id,
                  is_reply: true,
                  thread_id: w.id,
                }),
              }
            );
            const contentData = await contentResponse.json();
            if (contentData.ok && contentData.content) {
              replySubject = contentData.content.subject;
              replyBody = contentData.content.body;
            } else {
              replyBody = generateReplyBody();
            }
          } catch (error) {
            console.error("Error generating reply content:", error);
            replyBody = generateReplyBody();
          }
        }

        // Create connection object
        const account: Conn = {
          id: targetInbox.id,
          provider: targetInbox.provider as Provider,
          access_token: oauthToken.access_token,
          refresh_token: oauthToken.refresh_token || null,
          expires_at: oauthToken.expires_at || null,
          email: targetInbox.email,
          cooldown_until: null,
          meta: {},
        };

        // Ensure fresh token
        const freshAccount = await ensureFreshToken(account);

        // Send reply email
        const sendResult = await sendEmailViaProvider(freshAccount.provider, {
          account: freshAccount,
          to: senderInbox.email,
          subject: replySubject,
          html: `<p>${replyBody}</p>`,
          text: replyBody,
          threadId: w.id, // Thread reference for Gmail threading
        });

        if (!sendResult.ok) {
          console.error(`Failed to send warmup reply ${w.id}:`, sendResult.errorCode);
          errorCount++;
          continue;
        }

        // Mark as replied
        const { error: updateError } = await supabase
          .from("warmup_queue")
          .update({ replied_at: new Date().toISOString() })
          .eq("id", w.id);

        if (updateError) {
          console.error(`Error updating warmup_queue ${w.id}:`, updateError);
        } else {
          repliedCount++;
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
            .eq("id", targetInbox.id);
        }
      } catch (error: any) {
        console.error(`Error processing warmup reply ${w.id}:`, error);
        errorCount++;
      }
    }

    console.log(`Sent ${repliedCount} warmup replies, ${errorCount} errors`);

    return new Response(
      JSON.stringify({ ok: true, replied: repliedCount, errors: errorCount }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in warmup-reply-simulator:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

function generateReplyBody(): string {
  const replies = [
    "Thanks!",
    "Sounds good!",
    "Appreciate it!",
    "Perfect, thanks!",
    "Got it, thanks!",
    "Sounds great!",
    "Thanks for the update!",
    "Appreciate the follow-up!",
    "Thanks for getting back to me!",
    "Sounds good, thanks!",
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}

