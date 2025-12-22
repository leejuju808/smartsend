// SmartSend v3: AI Outreach Edge Function
// Generates personalized outreach messages and sends them via SmartSend API

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

interface OutreachMessage {
  subject: string;
  body: string;
}

// Generate personalized outreach message
async function generateOutreachMessage(
  lead: any,
  agentConfig: any,
  orgData: any
): Promise<OutreachMessage> {
  const leadContext = `
Contact: ${lead.contact_name || 'there'}
Company: ${lead.company || 'your company'}
Title: ${lead.title || ''}
Industry: ${lead.industry || ''}
Location: ${lead.location || ''}
  `.trim();

  const prompt = `Write a personalized cold outreach email for B2B sales.

Lead Information:
${leadContext}

Your Company:
${orgData.name || 'SmartSend'}
Industry Focus: ${agentConfig.target_industry || 'General'}

Requirements:
- Subject line: engaging, personalized, under 60 characters
- Body: friendly, concise (under 150 words), value-focused
- Include a clear call-to-action
- Avoid being too salesy

Return a JSON object:
{
  "subject": "email subject line",
  "body": "email body text (plain text, line breaks as \\n)"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert B2B sales email writer. Write concise, personalized cold outreach emails.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 400,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content);
    return {
      subject: parsed.subject || "Quick question",
      body: parsed.body || "Hi, I'd love to connect...",
    };
  } catch (error) {
    console.error("Error generating message:", error);
    // Fallback message
    return {
      subject: `Quick question about ${lead.company || 'your business'}`,
      body: `Hi ${lead.contact_name || 'there'},

I noticed ${lead.company ? `${lead.company} is` : 'you are'} in ${lead.industry || 'your industry'}. 

I'd love to share how we've helped similar companies. Are you open to a quick conversation?

Best,
SmartSend Team`,
    };
  }
}

// Send message via SmartSend API (multi-channel)
async function sendViaSmartSend(
  lead: any,
  message: OutreachMessage,
  orgId: string
): Promise<boolean> {
  try {
    // Get first available sending account for the org
    // Try to find by org_id first, fallback to user_id from org owner
    const { data: org } = await supabase
      .from("orgs")
      .select("owner_id")
      .eq("id", orgId)
      .single();

    let accounts = null;
    if (org?.owner_id) {
      const { data } = await supabase
        .from("sending_accounts")
        .select("id, email_address")
        .eq("user_id", org.owner_id)
        .limit(1)
        .maybeSingle();
      accounts = data;
    }

    // Fallback: try finding by org_id if the table has that column
    if (!accounts) {
      const { data } = await supabase
        .from("sending_accounts")
        .select("id, email_address")
        .eq("org_id", orgId)
        .limit(1)
        .maybeSingle();
      accounts = data;
    }

    if (!accounts) {
      console.error("No active sending account found");
      return false;
    }

    // Create a contact/lead entry if it doesn't exist
    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("org_id", orgId)
      .eq("email", lead.email)
      .maybeSingle();

    let contactId = contact?.id;

    if (!contactId) {
      const { data: newContact } = await supabase
        .from("contacts")
        .insert({
          org_id: orgId,
          email: lead.email,
          first_name: lead.contact_name?.split(" ")[0],
          last_name: lead.contact_name?.split(" ").slice(1).join(" "),
          company: lead.company,
          title: lead.title,
        })
        .select("id")
        .single();

      contactId = newContact?.id;
    }

    // Use SmartSend's send API via the send queue
    // Try smartsend_queue first, fallback to send_queue
    const queueData: any = {
      to_email: lead.email,
      subject: message.subject,
      body_html: message.body.replace(/\n/g, "<br>"),
      status: "queued",
      schedule_at: new Date().toISOString(),
    };

    // Add org_id if the table supports it
    const { error: sendError } = await supabase
      .from("smartsend_queue")
      .insert({
        ...queueData,
        provider_account_id: accounts?.id,
        lead_id: contactId,
      })
      .select()
      .single()
      .catch(async () => {
        // Fallback to send_queue if smartsend_queue doesn't exist
        return await supabase
          .from("send_queue")
          .insert({
            ...queueData,
            org_id: orgId,
            contact_id: contactId,
          });
      });

    if (sendError) {
      console.error("Error queuing message:", sendError);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending via SmartSend:", error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { agent_id, limit = 10 } = body;

    if (!agent_id) {
      return new Response(
        JSON.stringify({ error: "agent_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch agent config
    const { data: agent, error: agentError } = await supabase
      .from("ai_agents")
      .select("*")
      .eq("id", agent_id)
      .single();

    if (agentError || !agent) {
      return new Response(
        JSON.stringify({ error: "Agent not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check daily message limit
    if (agent.messages_sent >= agent.daily_message_limit) {
      return new Response(
        JSON.stringify({ error: "Daily message limit reached", limit: agent.daily_message_limit }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update agent status
    await supabase
      .from("ai_agents")
      .update({ status: "messaging" })
      .eq("id", agent_id);

    // Fetch org data for personalization
    const { data: org } = await supabase
      .from("orgs")
      .select("id, name")
      .eq("id", agent.org_id)
      .single();

    // Fetch top scored leads ready for outreach
    const { data: leads, error: leadsError } = await supabase
      .from("ai_leads_queue")
      .select("*")
      .eq("org_id", agent.org_id)
      .eq("agent_id", agent_id)
      .eq("status", "new")
      .order("score", { ascending: false })
      .limit(Math.min(limit, agent.daily_message_limit - agent.messages_sent));

    if (leadsError || !leads || leads.length === 0) {
      await supabase
        .from("ai_agents")
        .update({ status: "idle" })
        .eq("id", agent_id);
      
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No leads to message" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${leads.length} leads for outreach`);

    let sent = 0;
    let failed = 0;

    for (const lead of leads) {
      try {
        // Generate personalized message
        const message = await generateOutreachMessage(lead, agent, org || {});

        // Send via SmartSend
        const success = await sendViaSmartSend(lead, message, agent.org_id);

        if (success) {
          // Update lead status
          await supabase
            .from("ai_leads_queue")
            .update({
              status: "messaged",
              message_sent_at: new Date().toISOString(),
            })
            .eq("id", lead.id);

          // Update agent stats
          const { data: currentAgent } = await supabase
            .from("ai_agents")
            .select("messages_sent")
            .eq("id", agent_id)
            .single();
          
          await supabase
            .from("ai_agents")
            .update({ messages_sent: (currentAgent?.messages_sent || 0) + 1 })
            .eq("id", agent_id);

          sent++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Error processing lead ${lead.id}:`, error);
        failed++;
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Update agent status back to idle
    await supabase
      .from("ai_agents")
      .update({ status: "idle" })
      .eq("id", agent_id);

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        total: leads.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

