// Customer Success Bot Edge Function
// AI-driven check-ins for inactive enterprise users via SmartSend

import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

async function sendViaSmartSend(
  workspaceId: string,
  contactEmail: string,
  firstName: string,
  template: { subject: string; body: string }
): Promise<boolean> {
  try {
    // Verify workspace exists
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .maybeSingle();

    if (!workspace) {
      console.warn(`Workspace ${workspaceId} not found`);
      return false;
    }

    // Find or create a contact (contacts table uses workspace_id and email)
    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("email", contactEmail.toLowerCase())
      .maybeSingle();

    let contactId = contact?.id;

    if (!contactId) {
      // Create contact if it doesn't exist
      const { data: newContact, error: contactError } = await supabase
        .from("contacts")
        .insert({
          workspace_id: workspaceId,
          email: contactEmail.toLowerCase(),
          first_name: firstName,
        })
        .select("id")
        .single();
      
      if (contactError) {
        console.error("Error creating contact:", contactError);
        return false;
      }
      contactId = newContact?.id;
    }

    if (!contactId) return false;

    // Find customer success campaign template
    const { data: templateData } = await supabase
      .from("ai_templates")
      .select("subject, body")
      .eq("name", "Customer Success Check-In")
      .or("template_type.eq.customer_success,template_type.eq.winback")
      .maybeSingle();

    const finalSubject = templateData?.subject || template.subject;
    const finalBody = (templateData?.body || template.body).replace(
      "{{first_name}}",
      firstName
    );

    // Create a campaign if needed (or use existing customer success campaign)
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("name", "Customer Success Check-Ins")
      .maybeSingle();

    let campaignId = campaign?.id;

    if (!campaignId) {
      const { data: newCampaign, error: campaignError } = await supabase
        .from("campaigns")
        .insert({
          workspace_id: workspaceId,
          name: "Customer Success Check-Ins",
          subject_template: finalSubject,
          body_template: finalBody,
          status: "draft",
        })
        .select("id")
        .single();
      
      if (campaignError) {
        console.error("Error creating campaign:", campaignError);
        return false;
      }
      campaignId = newCampaign?.id;
    }

    if (!campaignId) return false;

    // Enqueue via SmartSend queue system
    // Note: smartsend_queue may need provider_account_id, so we'll make it optional
    const { error: queueError } = await supabase.from("smartsend_queue").insert({
      campaign_id: campaignId,
      lead_id: contactId,
      to_email: contactEmail,
      subject: finalSubject,
      body_html: `<p>${finalBody.replace(/\n/g, "</p><p>")}</p>`,
      status: "queued",
      schedule_at: new Date().toISOString(),
    });

    if (queueError) {
      console.error("Error enqueueing email:", queueError);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending via SmartSend:", error);
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    // Fetch inactive enterprise users (14+ days)
    const { data: inactiveUsers, error: usersError } = await supabase
      .from("inactive_users_14d")
      .select("*")
      .limit(50); // Process up to 50 users per run

    if (usersError) {
      console.error("Error fetching inactive users:", usersError);
      return new Response(
        JSON.stringify({ ok: false, error: usersError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!inactiveUsers || inactiveUsers.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No inactive enterprise users found", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let sent = 0;
    let failed = 0;

    for (const user of inactiveUsers) {
      if (!user.email || !user.workspace_id) {
        console.warn(`Skipping user ${user.user_id}: missing email or workspace`);
        continue;
      }

      try {
        // Generate personalized check-in message
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: `Write a short, friendly customer success check-in email for ${user.email}${user.full_name ? ` (${user.full_name})` : ""}.
They haven't been active for ${Math.floor(user.days_inactive || 14)} days.
Ask how they're using AUREV and offer help. Keep it under 150 words. Be warm but not pushy.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 300,
        });

        const generatedBody = completion.choices[0]?.message?.content;
        if (!generatedBody) {
          console.error(`Failed to generate message for ${user.email}`);
          failed++;
          continue;
        }

        const firstName = user.full_name?.split(" ")[0] || "there";
        const template = {
          subject: "Quick check-in — how's AUREV working for you?",
          body: generatedBody,
        };

        const success = await sendViaSmartSend(
          user.workspace_id,
          user.email,
          firstName,
          template
        );

        if (success) {
          sent++;
          console.log(`Sent customer success check-in to ${user.email}`);
        } else {
          failed++;
          console.error(`Failed to send check-in to ${user.email}`);
        }
      } catch (error) {
        console.error(`Error processing user ${user.user_id}:`, error);
        failed++;
      }
    }

    // Send Slack/Discord notification
    const slackWebhook = Deno.env.get("SLACK_WEBHOOK_URL");
    if (slackWebhook && sent > 0) {
      try {
        await fetch(slackWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `✅ Customer Success Bot: Sent ${sent} check-in(s). ${failed > 0 ? `${failed} failed.` : ""}`,
          }),
        });
      } catch (webhookError) {
        console.error("Error sending Slack notification:", webhookError);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Customer success check-ins processed",
        sent,
        failed,
        total: inactiveUsers.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in customer-success-bot:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

