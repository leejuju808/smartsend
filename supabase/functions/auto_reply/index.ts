import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.0.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

interface AutoReplyRequest {
  thread_id?: string;
  email_log_id?: string;
  campaign_id?: string;
  lead_id?: string;
}

serve(async (req) => {
  try {
    // Verify auth (cron token or service role)
    const authHeader = req.headers.get("Authorization");
    const cronToken = req.headers.get("x-cron-token");
    if (!authHeader && cronToken !== Deno.env.get("CRON_SECRET")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    let body: AutoReplyRequest = {};
    if (req.method === "POST") {
      body = await req.json();
    }

    // Find threads that need auto-reply processing
    // Criteria: status='unreplied', ai_flag='handwritten' (human reply), no existing auto_reply for this thread
    const { data: threads, error: threadsError } = await supabase
      .from("email_threads")
      .select(`
        id,
        org_id,
        lead_email,
        lead_name,
        subject,
        status,
        campaign_id,
        ext_thread_id
      `)
      .eq("status", "unreplied")
      .eq("ai_flag", "handwritten")
      .limit(body.thread_id ? 1 : 50); // Process batch or single thread

    if (threadsError) {
      console.error("Error fetching threads:", threadsError);
      return new Response(JSON.stringify({ error: threadsError.message }), { status: 500 });
    }

    if (!threads || threads.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "No threads to process" }), { status: 200 });
    }

    const results = [];

    for (const thread of threads) {
      try {
        // Check if auto-reply already exists
        const { data: existingReply } = await supabase
          .from("auto_replies")
          .select("id")
          .eq("thread_id", thread.id)
          .in("status", ["draft", "suggested", "sent"])
          .limit(1)
          .maybeSingle();

        if (existingReply) {
          console.log(`Skipping thread ${thread.id} - auto-reply already exists`);
          continue;
        }

        // Get the latest message in the thread (the reply we're responding to)
        const { data: messages } = await supabase
          .from("email_messages")
          .select("body, sender, sent_at")
          .eq("thread_id", thread.id)
          .eq("is_incoming", true)
          .order("sent_at", { ascending: false })
          .limit(1);

        if (!messages || messages.length === 0) {
          console.log(`No incoming messages found for thread ${thread.id}`);
          continue;
        }

        const latestReply = messages[0];

        // Get campaign context if available
        let campaignContext = null;
        if (thread.campaign_id) {
          const { data: campaign } = await supabase
            .from("campaigns")
            .select("name, subject, allow_auto_reply, auto_reply_confidence_threshold")
            .eq("id", thread.campaign_id)
            .maybeSingle();
          campaignContext = campaign;

          // Check if auto-reply is enabled for this campaign
          if (!campaign?.allow_auto_reply) {
            console.log(`Auto-reply disabled for campaign ${thread.campaign_id}`);
            continue;
          }
        }

        // Get lead context
        let leadContext = null;
        if (thread.lead_email) {
          const { data: lead } = await supabase
            .from("leads")
            .select("id, first_name, last_name, company, title, email")
            .eq("email", thread.lead_email)
            .maybeSingle();
          leadContext = lead;
          thread.lead_id = lead?.id;
        }

        // Get original email content (outbound message)
        const { data: originalEmail } = await supabase
          .from("email_messages")
          .select("body, subject")
          .eq("thread_id", thread.id)
          .eq("is_incoming", false)
          .order("sent_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        // Detect intent of the reply
        const intentResult = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "Classify the email reply intent. Return JSON: {intent: 'interested'|'not_interested'|'question'|'objection'|'ooo'|'unsubscribe', confidence: 0-1}"
            },
            {
              role: "user",
              content: `Email reply:\n${latestReply.body}\n\nClassify the intent.`
            }
          ],
          temperature: 0.2
        });

        let intent = { intent: "question", confidence: 0.5 };
        try {
          const intentContent = intentResult.choices[0].message.content;
          if (intentContent) {
            intent = JSON.parse(intentContent);
          }
        } catch {
          console.log("Failed to parse intent, using default");
        }

        // Generate auto-reply
        const systemPrompt = `You are a professional email assistant helping with cold email outreach. Generate a personalized, concise reply that:
1. Acknowledges the prospect's message
2. Provides value or answers their question
3. Maintains a friendly, professional tone
4. Is under 150 words
5. Includes a soft call-to-action if appropriate

${campaignContext ? `Campaign context: ${campaignContext.name}` : ""}
${leadContext ? `Prospect: ${leadContext.first_name || ""} ${leadContext.last_name || ""} at ${leadContext.company || ""}` : ""}
${originalEmail ? `Original email subject: ${originalEmail.subject || ""}` : ""}`;

        const replyGeneration = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Prospect's reply:\n${latestReply.body}\n\nGenerate a professional response.`
            }
          ],
          temperature: 0.7,
          max_tokens: 300
        });

        const generatedReply = replyGeneration.choices[0].message.content || "";
        
        // Extract subject (reply to original subject)
        const replySubject = originalEmail?.subject 
          ? (originalEmail.subject.startsWith("Re:") ? originalEmail.subject : `Re: ${originalEmail.subject}`)
          : `Re: ${thread.subject || ""}`;

        // Calculate confidence score
        // Base confidence on intent confidence + reply quality
        const baseConfidence = intent.confidence || 0.5;
        const replyLength = generatedReply.length;
        const lengthScore = replyLength > 50 && replyLength < 400 ? 0.2 : 0;
        const confidence = Math.min(0.95, baseConfidence + lengthScore + 0.2); // Cap at 0.95

        // Determine action based on confidence and campaign settings
        const threshold = campaignContext?.auto_reply_confidence_threshold || 0.8;
        const shouldAutoSend = confidence >= threshold && campaignContext?.allow_auto_reply;

        // Save auto-reply
        const { data: autoReply, error: replyError } = await supabase
          .from("auto_replies")
          .insert({
            org_id: thread.org_id,
            thread_id: thread.id,
            campaign_id: thread.campaign_id,
            lead_id: thread.lead_id,
            subject: replySubject,
            body_text: generatedReply,
            confidence: confidence,
            status: shouldAutoSend ? "sent" : "suggested",
            action_taken: shouldAutoSend ? "auto_sent" : "suggested",
            original_reply_text: latestReply.body,
            original_reply_intent: intent.intent,
            context_json: {
              campaign_name: campaignContext?.name,
              lead_name: leadContext ? `${leadContext.first_name} ${leadContext.last_name}` : null,
              lead_company: leadContext?.company,
              original_subject: originalEmail?.subject
            },
            tokens_used: replyGeneration.usage?.total_tokens || 0
          })
          .select()
          .single();

        if (replyError) {
          console.error(`Error saving auto-reply for thread ${thread.id}:`, replyError);
          continue;
        }

        // If auto-sending, actually send the email
        if (shouldAutoSend && autoReply) {
          // TODO: Integrate with email sending service (Gmail API, Resend, etc.)
          // For now, we'll mark it as sent and log the action
          console.log(`Auto-sending reply for thread ${thread.id}`);
          
          // Update thread status to 'replied'
          await supabase
            .from("email_threads")
            .update({ status: "replied", last_outgoing_at: new Date().toISOString() })
            .eq("id", thread.id);

          // Create notification
          await supabase.from("notifications").insert({
            user_id: thread.org_id, // Note: may need to get actual user_id from org
            org_id: thread.org_id,
            type: "auto_reply_sent",
            severity: "success",
            title: "Auto-reply sent",
            message: `Automatically replied to ${thread.lead_email}`,
            action_url: `/dashboard/inbox?thread=${thread.id}`,
            sent_email: false,
            metadata: { thread_id: thread.id, confidence: confidence }
          });
        } else {
          // Create notification for suggested reply
          await supabase.from("notifications").insert({
            user_id: thread.org_id,
            org_id: thread.org_id,
            type: "auto_reply_suggested",
            severity: "info",
            title: "Suggested reply generated",
            message: `AI generated a reply for ${thread.lead_email} (confidence: ${(confidence * 100).toFixed(0)}%)`,
            action_url: `/dashboard/inbox?thread=${thread.id}&reply=${autoReply.id}`,
            sent_email: false,
            metadata: { thread_id: thread.id, reply_id: autoReply.id, confidence: confidence }
          });
        }

        results.push({
          thread_id: thread.id,
          action: shouldAutoSend ? "auto_sent" : "suggested",
          confidence: confidence
        });

      } catch (error) {
        console.error(`Error processing thread ${thread.id}:`, error);
        continue;
      }
    }

    return new Response(
      JSON.stringify({
        processed: results.length,
        results: results,
        message: "Auto-reply processing complete"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in auto_reply function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500 }
    );
  }
});

