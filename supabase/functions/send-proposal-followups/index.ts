// Block 22262 — SmartSend Roofing Proposal Follow-Up Engine v1
// Edge Function — Send Due Follow-Ups (AI-Powered)
// Runs every few minutes (via Supabase cron or scheduler)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.56.0";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const client = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

  try {
    // 1. Fetch due followups
    const { data: followups, error } = await supabase
      .from("proposal_followups")
      .select(`
        id,
        proposal_id,
        lead_id,
        workspace_id,
        step_number,
        intent,
        template:proposal_followup_templates(*),
        proposal:proposals(
          amount,
          proposal_url,
          status,
          sent_at
        ),
        lead:leads(
          first_name,
          last_name,
          email,
          phone,
          city,
          state,
          address,
          status
        )
      `)
      .eq("status", "pending")
      .lte("send_at", new Date().toISOString())
      .limit(50);

    if (error) {
      console.error("Error fetching followups:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!followups || followups.length === 0) {
      return new Response(
        JSON.stringify({ message: "No followups due", count: 0 }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Processing ${followups.length} due followups`);

    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const f of followups) {
      results.processed++;

      try {
        const lead = f.lead as any;
        const template = f.template as any;
        const proposal = f.proposal as any;

        if (!lead || !template || !proposal) {
          console.error("Missing required data for followup", f.id);
          results.failed++;
          continue;
        }

        // Get contractor/workspace info
        const { data: contractorProfile } = await supabase
          .from("contractor_profile")
          .select("company_name")
          .eq("workspace_id", f.workspace_id)
          .single();

        const { data: workspace } = await supabase
          .from("workspaces")
          .select("name")
          .eq("id", f.workspace_id)
          .single();

        const companyName =
          contractorProfile?.company_name || workspace?.name || "SmartSend";
        const companyPhone = ""; // TODO: Add phone to contractor_profile or workspace

        // Get property address from lead or proposal
        const propertyAddress = lead.address || "";
        const propertyCity = lead.city || "";

        // 2. Build AI prompt to lightly personalize the template
        const prompt = `
You write short, clear follow-up emails for a local roofing company.

Context:
- Homeowner: ${lead.first_name || ""} ${lead.last_name || ""}
- Property: ${propertyAddress}, ${propertyCity}, ${lead.state || ""}
- Proposal amount: $${proposal.amount || "N/A"}
- Intent: ${f.intent}
- Company: ${companyName}
- Phone: ${companyPhone || "contact us"}

Base subject:
${template.subject_template}

Base body:
${template.body_template}

Goal:
- Keep it under 180 words.
- Sound like a real local roofer, not a robot.
- Be respectful, not pushy.
- Refer to city or recent weather naturally if possible.
- Replace template variables like {{first_name}}, {{company_name}}, {{company_phone}}, {{property_address}}, {{property_city}} with actual values.

Return JSON:
{
  "subject": "final subject line",
  "body": "final email body with line breaks"
}
        `.trim();

        const completion = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        });

        const resultText = completion.choices[0].message.content ?? "{}";
        let result: { subject?: string; body?: string };
        try {
          result = JSON.parse(resultText);
        } catch (e) {
          console.error("Failed to parse AI response:", resultText);
          result = {
            subject: template.subject_template,
            body: template.body_template,
          };
        }

        const subject =
          result.subject ||
          template.subject_template
            .replace(/\{\{first_name\}\}/g, lead.first_name || "")
            .replace(/\{\{company_name\}\}/g, companyName)
            .replace(/\{\{company_phone\}\}/g, companyPhone)
            .replace(/\{\{property_address\}\}/g, propertyAddress)
            .replace(/\{\{property_city\}\}/g, propertyCity);

        const body =
          result.body ||
          template.body_template
            .replace(/\{\{first_name\}\}/g, lead.first_name || "")
            .replace(/\{\{company_name\}\}/g, companyName)
            .replace(/\{\{company_phone\}\}/g, companyPhone)
            .replace(/\{\{property_address\}\}/g, propertyAddress)
            .replace(/\{\{property_city\}\}/g, propertyCity);

        // 3. TODO: Send email via your email provider
        // For v1, we'll mark as sent and log the event
        // Actual email sending can be integrated via:
        // - /api/inbox/send endpoint
        // - Direct Gmail/Outlook API call
        // - Email queue worker
        
        // For now, log that email would be sent
        console.log(`Would send email to ${lead.email}:`, {
          subject,
          followup_id: f.id,
          proposal_id: f.proposal_id,
        });
        
        // TODO: Uncomment and adapt when email sending is ready:
        // const emailResponse = await fetch(`${Deno.env.get("APP_URL")}/api/inbox/send`, {
        //   method: "POST",
        //   headers: { "Content-Type": "application/json" },
        //   body: JSON.stringify({
        //     threadId: proposal.thread_id, // if available
        //     to: lead.email,
        //     subject,
        //     bodyText: body,
        //     bodyHtml: body.replace(/\n/g, "<br>"),
        //   }),
        // });
        // if (!emailResponse.ok) {
        //   throw new Error(`Email send failed: ${await emailResponse.text()}`);
        // }

        // 4. Mark followup as sent
        await supabase
          .from("proposal_followups")
          .update({
            status: "sent",
            updated_at: new Date().toISOString(),
          })
          .eq("id", f.id);

        // 5. Log event into proposal_events for the timeline
        await supabase.from("proposal_events").insert({
          proposal_id: f.proposal_id,
          lead_id: f.lead_id,
          workspace_id: f.workspace_id,
          event_type: "proposal_followup",
          metadata: {
            followup_id: f.id,
            step_number: f.step_number,
            intent: f.intent,
            subject,
          },
        });

        results.sent++;
        console.log(`Sent followup ${f.id} for proposal ${f.proposal_id}`);
      } catch (err: any) {
        console.error(`Error processing followup ${f.id}:`, err);

        results.failed++;
        results.errors.push(`${f.id}: ${err.message || String(err)}`);

        await supabase
          .from("proposal_followups")
          .update({
            status: "failed",
            last_error: String(err),
            updated_at: new Date().toISOString(),
          })
          .eq("id", f.id);
      }
    }

    return new Response(
      JSON.stringify({
        message: "Processed followups",
        ...results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Fatal error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

