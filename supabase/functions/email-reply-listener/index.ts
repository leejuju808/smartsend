import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();

    // 🔹 Adjust this mapping to your provider's webhook format
    const fromEmail = (payload.from || payload.sender || payload["sender-email"] || "").toLowerCase().trim();
    const toEmail = (payload.to || payload.recipient || payload["recipient-email"] || "").toLowerCase().trim();
    const subject = payload.subject || "";
    const textBody = payload.text || payload.body || payload["body-plain"] || "";
    const htmlBody = payload.html || payload["body-html"] || "";
    const providerMessageId = payload.message_id || payload.id || payload["message-id"] || null;
    const inReplyTo = payload.in_reply_to || payload["In-Reply-To"] || payload["in-reply-to"] || null;

    if (!fromEmail || !toEmail) {
      console.error("Missing from/to in payload", { fromEmail, toEmail, payload });
      return new Response("Bad Request: Missing from/to email", { status: 400 });
    }

    // 1) Find company + contact by TO / FROM (depending on your model)
    // Here we assume:
    // - TO email is the company's outbound alias (mapped to campaign/workspace)
    // - FROM email is the homeowner (mapped to contact)

    // Try to find campaign by from_email (campaigns may have from_email field)
    let companyId: string | null = null;
    let campaignId: string | null = null;
    let workspaceId: string | null = null;

    // First, try to find campaign by matching to_email with campaign's from_email
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, workspace_id, company_id")
      .ilike("from_email", `%${toEmail}%`)
      .maybeSingle();

    if (campaign) {
      campaignId = campaign.id;
      workspaceId = campaign.workspace_id;
      companyId = campaign.company_id || null;
    }

    // If no campaign found, try to find workspace via company_settings or other means
    if (!workspaceId) {
      // Try to find workspace via company_settings that might have company_email matching to_email
      const { data: companySettings } = await supabase
        .from("company_settings")
        .select("workspace_id")
        .ilike("company_email", `%${toEmail}%`)
        .maybeSingle();

      if (companySettings) {
        workspaceId = companySettings.workspace_id;
      }
    }

    // If still no workspace, try to find via outbound_email_accounts
    if (!workspaceId) {
      const { data: emailAccount } = await supabase
        .from("outbound_email_accounts")
        .select("org_id, user_id")
        .ilike("from_email", toEmail)
        .maybeSingle();

      if (emailAccount) {
        // Try to get workspace_id from org_id or user_id
        if (emailAccount.org_id) {
          // Try to find workspace via org
          const { data: org } = await supabase
            .from("organizations")
            .select("id")
            .eq("id", emailAccount.org_id)
            .maybeSingle();
          
          if (org) {
            // For now, we'll use org_id as a fallback identifier
            workspaceId = emailAccount.org_id;
          }
        }
      }
    }

    if (!workspaceId) {
      console.warn("No workspace/company found for to_email:", toEmail);
      return new Response("OK", { status: 200 });
    }

    // Find contact by FROM email within the workspace
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, workspace_id, first_name, email, city, company_id")
      .eq("workspace_id", workspaceId)
      .ilike("email", fromEmail)
      .maybeSingle();

    if (!contact) {
      console.warn("No contact found for from_email:", fromEmail, "in workspace:", workspaceId);
      // You could auto-create a contact here in a later version
      return new Response("OK", { status: 200 });
    }

    const contactId = contact.id;

    // If we don't have companyId yet, try to find it via workspace
    if (!companyId && workspaceId) {
      // Try to find a company associated with this workspace
      // This is a fallback - adjust based on your actual schema
      const { data: workspaceCompany } = await supabase
        .from("companies")
        .select("id")
        .eq("workspace_id", workspaceId)
        .limit(1)
        .maybeSingle();

      if (workspaceCompany) {
        companyId = workspaceCompany.id;
      }
    }

    // 2) Find active follow_up_profile for this contact
    let finalProfile = null;
    
    // Try to find profile with company_id if we have it
    if (companyId) {
      const { data: profile } = await supabase
        .from("follow_up_profiles")
        .select("id, company_id, campaign_id, status, current_stage")
        .eq("company_id", companyId)
        .eq("contact_id", contactId)
        .in("status", ["active", "paused"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      finalProfile = profile || null;
    }

    // If no profile found with company_id, try without company_id filter
    if (!finalProfile) {
      const { data: profileAlt } = await supabase
        .from("follow_up_profiles")
        .select("id, company_id, campaign_id, status, current_stage")
        .eq("contact_id", contactId)
        .in("status", ["active", "paused"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      finalProfile = profileAlt || null;
      if (finalProfile) {
        campaignId = finalProfile.campaign_id || campaignId;
        companyId = finalProfile.company_id || companyId;
      }
    } else {
      campaignId = finalProfile.campaign_id || campaignId;
      companyId = finalProfile.company_id || companyId;
    }

    // 3) Insert inbound_emails record
    const { data: inbound, error: inboundError } = await supabase
      .from("inbound_emails")
      .insert({
        company_id: companyId,
        campaign_id: campaignId,
        contact_id: contactId,
        message_provider_id: providerMessageId,
        in_reply_to_message_id: inReplyTo,
        from_email: fromEmail,
        to_email: toEmail,
        subject,
        text_body: textBody,
        html_body: htmlBody,
      })
      .select("id")
      .single();

    if (inboundError) {
      console.error("Error inserting inbound email:", inboundError);
      return new Response("Error", { status: 500 });
    }

    const inboundId = inbound.id;

    // 4) If there is a follow_up_profile → stop follow-ups + classify intent
    if (finalProfile) {
      const intent = classifyLeadIntent(textBody || htmlBody || "");

      // Update follow_up_profile
      const { error: profileError } = await supabase
        .from("follow_up_profiles")
        .update({
          status: "stopped_by_reply",
          last_inbound_email_id: inboundId,
          last_inbound_email_provider_id: providerMessageId,
          last_inbound_at: new Date().toISOString(),
          lead_intent: intent,
          next_run_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", finalProfile.id);

      if (profileError) {
        console.error("Error updating follow_up_profile:", profileError);
      }

      // Log the event
      await supabase.from("follow_up_logs").insert({
        follow_up_profile_id: finalProfile.id,
        company_id: companyId || finalProfile.company_id,
        campaign_id: campaignId || finalProfile.campaign_id,
        contact_id: contactId,
        from_stage: finalProfile.current_stage,
        to_stage: finalProfile.current_stage,
        action: "stopped_by_reply",
        notes: `Lead intent classified as ${intent}`,
      });

      // (Optional) Also update a central leads table if you have one
      if (companyId) {
        // Try updating by company_id and contact_id first
        const { error: leadsError } = await supabase
          .from("leads")
          .update({
            intent: intent,
            last_contacted_at: new Date().toISOString(),
          })
          .eq("company_id", companyId)
          .eq("contact_id", contactId);

        if (leadsError) {
          // Leads table might not have contact_id, try with email
          const { error: leadsErrorAlt } = await supabase
            .from("leads")
            .update({
              intent: intent,
              last_contacted_at: new Date().toISOString(),
            })
            .eq("company_id", companyId)
            .ilike("email", fromEmail);

          if (leadsErrorAlt) {
            // Try without company_id, just by email
            const { error: leadsErrorEmail } = await supabase
              .from("leads")
              .update({
                intent: intent,
                last_contacted_at: new Date().toISOString(),
              })
              .ilike("email", fromEmail)
              .limit(1);

            if (leadsErrorEmail) {
              console.warn("Could not update leads table:", leadsErrorEmail);
            }
          }
        }
      } else if (workspaceId) {
        // Try updating by workspace_id and email
        const { error: leadsErrorWorkspace } = await supabase
          .from("leads")
          .update({
            intent: intent,
            last_contacted_at: new Date().toISOString(),
          })
          .eq("workspace_id", workspaceId)
          .ilike("email", fromEmail)
          .limit(1);

        if (leadsErrorWorkspace) {
          console.warn("Could not update leads table by workspace:", leadsErrorWorkspace);
        }
      }

      // 🔹 NEW: Auto-reply engine for warm/hot
      if ((intent === "warm" || intent === "hot") && companyId && campaignId && contact) {
        await sendAutoReplyForIntent({
          companyId,
          contact: {
            id: contact.id,
            first_name: contact.first_name,
            email: contact.email || fromEmail,
            city: contact.city,
          },
          profile: finalProfile,
          intent,
        }).catch((err) =>
          console.error("Error in sendAutoReplyForIntent:", err)
        );
      }
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("email-reply-listener error:", e);
    return new Response("Error", { status: 500 });
  }
});

/**
 * SUPER SIMPLE v1 intent classifier (rule-based).
 * Later, this becomes an AI classifier.
 */
function classifyLeadIntent(text: string): "hot" | "warm" | "not_interested" | "other" {
  const content = text.toLowerCase();

  if (
    content.includes("let's do it") ||
    content.includes("let's do it") ||
    content.includes("go ahead") ||
    content.includes("schedule") ||
    content.includes("book") ||
    (content.includes("yes") && content.includes("come out")) ||
    content.includes("when can you") ||
    content.includes("what time") ||
    content.includes("available") ||
    content.includes("ready to move forward")
  ) {
    return "hot";
  }

  if (
    content.includes("interested") ||
    content.includes("can you send") ||
    content.includes("more info") ||
    content.includes("more information") ||
    content.includes("estimate") ||
    content.includes("quote") ||
    content.includes("pricing") ||
    content.includes("cost") ||
    content.includes("how much")
  ) {
    return "warm";
  }

  if (
    content.includes("not interested") ||
    content.includes("no longer") ||
    content.includes("stop") ||
    content.includes("do not contact") ||
    content.includes("already fixed") ||
    content.includes("went with someone else") ||
    content.includes("unsubscribe") ||
    content.includes("remove me") ||
    content.includes("don't contact")
  ) {
    return "not_interested";
  }

  return "other";
}

// 🔹 NEW: auto-responder engine for warm/hot leads
async function sendAutoReplyForIntent(args: {
  companyId: string;
  contact: { id: string; first_name: string | null; email: string; city: string | null };
  profile: { id: string; campaign_id: string };
  intent: "hot" | "warm" | "not_interested" | "other";
}) {
  const { companyId, contact, profile, intent } = args;

  // 1) Load campaign + follow-up settings
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, company_id, booking_link_url")
    .eq("id", profile.campaign_id)
    .single();

  if (campaignError || !campaign) {
    console.warn("No campaign found for auto-reply:", profile.campaign_id);
    return;
  }

  const { data: settings, error: settingsError } = await supabase
    .from("campaign_follow_up_settings")
    .select("*")
    .eq("campaign_id", campaign.id)
    .maybeSingle();

  if (settingsError) {
    console.error("Error loading follow-up settings:", settingsError);
    return;
  }

  // If settings not created yet, assume defaults
  const autoSendWarm = settings ? settings.auto_send_warm : true;
  const autoSendHot = settings ? settings.auto_send_hot : true;

  if (intent === "warm" && !autoSendWarm) return;
  if (intent === "hot" && !autoSendHot) return;

  const bookingLink = campaign.booking_link_url || "";
  const firstName = contact.first_name || "there";
  const city = contact.city || "";

  const context = {
    first_name: firstName,
    city,
    booking_link: bookingLink,
  };

  let subject: string;
  let body: string;

  if (intent === "hot") {
    subject = "Got you — let's get this scheduled";
    body = fillTemplate(
      `
Hi {{first_name}},

Great — we can take care of that for you.

I can get someone out **today or tomorrow** to look at your roof and give you a quote.

You can grab a time that works best for you here:

{{booking_link}}

If you prefer, just reply with a day/time that works and we'll lock it in.

– Your roofing team
      `,
      context
    );
  } else {
    // warm
    subject = "Thanks for reaching out about your roof";
    body = fillTemplate(
      `
Hi {{first_name}},

Thanks for getting back to us.

We've been helping a lot of homeowners in {{city}} with roof issues lately,
and we'd be happy to take a look at yours and give you a straightforward estimate.

You can pick a time that works best here:

{{booking_link}}

If you'd rather not use a link, just reply with a couple of times that work for you.

– Your roofing team
      `,
      context
    );
  }

  // 2) Insert into email_send_queue (no follow_up_stage since it's a direct reply)
  const { error: queueError } = await supabase.from("email_send_queue").insert({
    company_id: companyId,
    campaign_id: campaign.id,
    contact_id: contact.id,
    follow_up_profile_id: profile.id,
    follow_up_stage: null,
    to_email: contact.email,
    subject,
    body,
    status: "pending",
    scheduled_at: new Date().toISOString(),
  });

  if (queueError) {
    console.error("Error queueing auto-reply:", queueError);
    return;
  }

  // 3) Log it
  await supabase.from("follow_up_logs").insert({
    follow_up_profile_id: profile.id,
    company_id: companyId,
    campaign_id: campaign.id,
    contact_id: contact.id,
    from_stage: null,
    to_stage: null,
    action: intent === "hot" ? "auto_reply_hot" : "auto_reply_warm",
    notes: `Auto-reply sent for intent ${intent}`,
  });
}

function fillTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/{{\s*([^}]+)\s*}}/g, (_match, key) => {
    const k = String(key).trim();
    return context[k] ?? "";
  });
}

