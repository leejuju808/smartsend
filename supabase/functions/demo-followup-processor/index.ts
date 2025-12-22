// supabase/functions/demo-followup-processor/index.ts
// Block 23472 — SmartSend Roofing Demo Follow-Up Processor v1
// Processes scheduled demo follow-up messages and sends them via email/SMS

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (req) => {
  try {
    const now = new Date().toISOString();
    
    // Fetch pending follow-ups that are due
    const { data: pendingFollowups, error: fetchError } = await supabase
      .from("demo_followup_schedule")
      .select(`
        id,
        demo_tracking_id,
        workspace_id,
        contact_id,
        lead_id,
        followup_step,
        followup_type,
        scheduled_for,
        template_key,
        demo_tracking:demo_tracking_id (
          demo_date,
          status
        )
      `)
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .limit(100); // Safety limit per run

    if (fetchError) {
      console.error("Error fetching pending follow-ups:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch follow-ups", details: fetchError }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!pendingFollowups || pendingFollowups.length === 0) {
      return new Response(
        JSON.stringify({ message: "No follow-ups due", processed: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let sentCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const followup of pendingFollowups) {
      // Skip if demo tracking is no longer active
      if (followup.demo_tracking && followup.demo_tracking.status !== 'active') {
        await supabase
          .from("demo_followup_schedule")
          .update({ status: "cancelled", updated_at: now })
          .eq("id", followup.id);
        skippedCount++;
        continue;
      }

      try {
        const result = await processFollowup(followup);
        if (result.success) {
          sentCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        console.error(`Error processing follow-up ${followup.id}:`, error);
        errorCount++;
        
        // Mark as skipped on error (don't retry indefinitely)
        await supabase
          .from("demo_followup_schedule")
          .update({ status: "skipped", updated_at: now })
          .eq("id", followup.id);
      }
    }

    return new Response(
      JSON.stringify({
        message: "Processed demo follow-ups",
        processed: pendingFollowups.length,
        sent: sentCount,
        skipped: skippedCount,
        errors: errorCount,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error in demo-followup-processor:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function processFollowup(followup: any): Promise<{ success: boolean }> {
  // Get template
  const { data: template, error: templateError } = await supabase
    .from("email_templates")
    .select("base_subject, base_body")
    .eq("template_key", followup.template_key)
    .is("org_id", null) // Global templates
    .maybeSingle();

  if (templateError || !template) {
    console.error(`Template not found for key: ${followup.template_key}`);
    return { success: false };
  }

  // Get contact/lead info
  let contactEmail: string | null = null;
  let contactPhone: string | null = null;
  let contactName: string | null = null;

  if (followup.contact_id) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("email, phone, name, first_name")
      .eq("id", followup.contact_id)
      .maybeSingle();
    
    if (contact) {
      contactEmail = contact.email;
      contactPhone = contact.phone;
      contactName = contact.first_name || contact.name || null;
    }
  } else if (followup.lead_id) {
    const { data: lead } = await supabase
      .from("leads")
      .select("email, phone, name, first_name")
      .eq("id", followup.lead_id)
      .maybeSingle();
    
    if (lead) {
      contactEmail = lead.email;
      contactPhone = lead.phone;
      contactName = lead.first_name || lead.name || null;
    }
  }

  if (!contactEmail && !contactPhone) {
    console.error(`No contact method found for follow-up ${followup.id}`);
    return { success: false };
  }

  // Replace template variables
  const firstName = contactName ? contactName.split(' ')[0] : 'there';
  const subject = fillTemplate(template.base_subject, { FIRST_NAME: firstName, SENDER_NAME: 'Julian' });
  const body = fillTemplate(template.base_body, { FIRST_NAME: firstName, SENDER_NAME: 'Julian' });

  // Send email or SMS based on type
  if (followup.followup_type === 'email' && contactEmail) {
    // Get workspace owner user_id for emails_outbox
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", followup.workspace_id)
      .maybeSingle();
    
    if (!workspace || !workspace.owner_id) {
      console.error(`Workspace owner not found for workspace ${followup.workspace_id}`);
      return { success: false };
    }

    // Insert into emails_outbox (flexible email queue that doesn't require campaign_id)
    const { error: queueError } = await supabase
      .from("emails_outbox")
      .insert({
        user_id: workspace.owner_id,
        lead_id: followup.lead_id,
        to_email: contactEmail,
        to_name: contactName,
        subject: subject,
        html: body,
        scheduled_at: new Date().toISOString(),
        status: "queued",
      });

    if (queueError) {
      console.error(`Error queuing email for follow-up ${followup.id}:`, queueError);
      return { success: false };
    }

    // Mark as sent
    await supabase
      .from("demo_followup_schedule")
      .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", followup.id);

    return { success: true };
  } else if (followup.followup_type === 'sms' && contactPhone) {
    // Insert into SMS send queue (adjust based on your SMS infrastructure)
    const { error: queueError } = await supabase
      .from("messages")
      .insert({
        workspace_id: followup.workspace_id,
        contact_id: followup.contact_id,
        lead_id: followup.lead_id,
        channel: "sms",
        phone: contactPhone,
        body_text: body,
        direction: "outbound",
        status: "pending",
        sent_at: new Date().toISOString(),
        metadata: {
          demo_followup_id: followup.id,
          followup_step: followup.followup_step,
        },
      });

    if (queueError) {
      console.error(`Error queuing SMS for follow-up ${followup.id}:`, queueError);
      return { success: false };
    }

    // Mark as sent
    await supabase
      .from("demo_followup_schedule")
      .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", followup.id);

    return { success: true };
  }

  return { success: false };
}

function fillTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/{{\s*([^}]+)\s*}}/g, (_match, key) => {
    const k = String(key).trim();
    return context[k] ?? "";
  });
}

