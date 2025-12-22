// app/api/replies/[id]/classify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyReplyIntent, type ReplyIntentLabel } from "@/lib/ai/reply-intent";
import { updateContactLeadStatusFromIntent } from "@/lib/pipeline/intent-to-status";
import { applyAutoWorkflows, type IntentLabel } from "@/lib/workflows/applyAutoWorkflows";
import { sendInstantReplyNotification } from "@/lib/notifications/sendInstantEmail";
import { processReplyWithIntelligenceV2 } from "@/lib/ai/replyIntelligenceIntegration";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const inboundId = params.id;
  const supabase = createClient();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // 1) Fetch inbound message (RLS ensures workspace access)
    const { data: inbound, error: inboundError } = await supabase
      .from("inbound_messages")
      .select(
        "id, subject, text_body, html_body, workspace_id, lead_id, from_email"
      )
      .eq("id", inboundId)
      .single();

    if (inboundError || !inbound) {
      return NextResponse.json(
        { error: "Inbound message not found" },
        { status: 404 }
      );
    }

    const bodySource =
      inbound.text_body ||
      (inbound.html_body
        ? stripHtml(inbound.html_body)
        : null);

    // 2) Classify intent via AI (v1)
    const result = await classifyReplyIntent({
      subject: inbound.subject,
      body: bodySource,
    });

    // Block 16000 — SmartSend AI Reply Brain v2
    // Run comprehensive intelligence analysis in parallel
    let intelligenceV2: any = null;
    try {
      // Find contact_id if we have it
      let contactIdForIntelligence: string | null = null;
      if (contactId) {
        contactIdForIntelligence = contactId;
      } else if (inbound.from_email) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("id")
          .eq("workspace_id", inbound.workspace_id)
          .eq("email", inbound.from_email)
          .maybeSingle();
        contactIdForIntelligence = contact?.id ?? null;
      }

      intelligenceV2 = await processReplyWithIntelligenceV2({
        inboundMessageId: inbound.id,
        contactId: contactIdForIntelligence,
        campaignId: inbound.campaign_id || null,
        workspaceId: inbound.workspace_id,
        text: bodySource || "",
        subject: inbound.subject || undefined,
      });
    } catch (intelligenceError) {
      console.error("Failed to process Reply Brain v2 intelligence:", intelligenceError);
      // Don't fail the request if v2 intelligence fails - v1 classification still works
    }

    // 3) Persist on the inbound message
    const { error: updateInboundError } = await supabase
      .from("inbound_messages")
      .update({
        intent_label: result.label,
        intent_confidence: result.confidence,
        intent_raw: result,
      })
      .eq("id", inbound.id);

    if (updateInboundError) {
      console.error("Failed to save intent on inbound:", updateInboundError);
    }

    // 4) Also tag the LEAD with this intent (if we can find it)
    let leadId = inbound.lead_id as string | null;

    if (!leadId) {
      // Try to find a lead by workspace + from_email
      const { data: lead } = await supabase
        .from("leads")
        .select("id")
        .eq("workspace_id", inbound.workspace_id)
        .eq("email", inbound.from_email)
        .maybeSingle();

      leadId = lead?.id ?? null;
    }

    if (leadId) {
      const { error: updateLeadError } = await supabase
        .from("leads")
        .update({
          reply_intent_label: result.label,
          reply_intent_confidence: result.confidence,
          reply_intent_updated_at: new Date().toISOString(),
        })
        .eq("id", leadId);

      if (updateLeadError) {
        console.error("Failed to save intent on lead:", updateLeadError);
      }

      // Block 8840 — Hot Lead Events
      // Create hot_lead_event when lead is classified as hot
      if (result.label === "interested" || result.label === "meeting_booked") {
        // Get lead with owner_id
        const { data: leadRow } = await supabase
          .from("leads")
          .select("id, owner_id, workspace_id")
          .eq("id", leadId)
          .maybeSingle();

        if (leadRow) {
          // Try to get owner_id from lead, fallback to current user
          const ownerId = leadRow.owner_id || user.id;

          // Try to find matching inbound_emails record
          let inboundEmailId: string | null = null;
          if (inbound.from_email) {
            const { data: inboundEmail } = await supabase
              .from("inbound_emails")
              .select("id")
              .eq("lead_id", leadId)
              .eq("from_email", inbound.from_email)
              .order("received_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            inboundEmailId = inboundEmail?.id ?? null;
          }

          // Insert hot_lead_event
          await supabase.from("hot_lead_events").insert({
            owner_id: ownerId,
            lead_id: leadRow.id,
            inbound_email_id: inboundEmailId,
            inbound_message_id: inbound.id,
          }).catch((err) => {
            console.error("Failed to create hot_lead_event:", err);
            // Don't fail the request if event creation fails
          });

          // Block 11800 — Hot Lead Alerts v1
          // Trigger instant alert notification system
          try {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
            const alertFunctionUrl = `${supabaseUrl}/functions/v1/alerts/hot-lead`;
            const alertPayload = {
              user_id: ownerId,
              workspace_id: leadRow.workspace_id,
              lead_id: leadRow.id,
              inbound_message_id: inbound.id,
              reply_snippet: bodySource?.slice(0, 200) || null,
            };

            // Get lead name/email for alert
            const { data: leadDetails } = await supabase
              .from("leads")
              .select("name, email, first_name, last_name")
              .eq("id", leadRow.id)
              .single();

            if (leadDetails) {
              alertPayload.lead_name =
                leadDetails.name ||
                [leadDetails.first_name, leadDetails.last_name]
                  .filter(Boolean)
                  .join(" ") ||
                leadDetails.email ||
                null;
              alertPayload.lead_email = leadDetails.email || null;
            }

            // Call edge function to send alerts
            // Use service role key for authentication
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (!serviceRoleKey) {
              console.warn("SUPABASE_SERVICE_ROLE_KEY not set, skipping hot lead alert");
            } else {
              const alertResponse = await fetch(alertFunctionUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify(alertPayload),
              }).catch((alertErr) => {
                console.error("Failed to trigger hot lead alert:", alertErr);
                return null;
              });

              if (alertResponse && !alertResponse.ok) {
                const alertError = await alertResponse.text();
                console.error("Hot lead alert function error:", alertError);
              }
            }

          } catch (alertErr) {
            console.error("Failed to trigger hot lead alert:", alertErr);
            // Don't fail the request if alert fails
          }
        }
      }
    }

    // 6) Update contact lead_status if we can find the contact
    let contactId: string | null = null;

    // Try to find contact by workspace + from_email
    if (inbound.from_email) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("id")
        .eq("workspace_id", inbound.workspace_id)
        .eq("email", inbound.from_email)
        .maybeSingle();

      contactId = contact?.id ?? null;
    }

    // If we found a contact, update its lead_status based on intent
    if (contactId) {
      await updateContactLeadStatusFromIntent(
        supabase,
        contactId,
        result.label
      );

      // Block 16100 — Apply workflow automation
      const workflowIntentLabel = mapReplyIntentToWorkflowIntent(result.label);
      if (workflowIntentLabel) {
        await applyAutoWorkflows({
          workspaceId: inbound.workspace_id,
          contactId,
          intentLabel: workflowIntentLabel,
          eventType: "reply_received",
        });

        // Block 16200 — Send instant notification email
        if (bodySource) {
          await sendInstantReplyNotification({
            workspaceId: inbound.workspace_id,
            contactId,
            intentLabel: workflowIntentLabel,
            replyBody: bodySource,
          }).catch((err) => {
            console.error("Failed to send instant notification:", err);
            // Don't fail the request if notification fails
          });
        }
      }
    }

    // Block 8660 — Intent-Driven Reply Actions
    // Map classifier label to intent and call process_reply_intent
    const intentValue = mapClassifierLabelToIntent(result.label);
    if (intentValue && inbound.campaign_id) {
      // Ensure email_replies record exists
      let replyId: string | null = null;
      
      // Try to find existing email_replies record
      const { data: existingReply } = await supabase
        .from("email_replies")
        .select("id")
        .eq("workspace_id", inbound.workspace_id)
        .eq("campaign_id", inbound.campaign_id)
        .eq("from_email", inbound.from_email)
        .maybeSingle();

      if (existingReply) {
        replyId = existingReply.id;
        
        // Update intent on existing record
        await supabase
          .from("email_replies")
          .update({ intent: intentValue })
          .eq("id", replyId);
      } else {
        // Create email_replies record if it doesn't exist
        // Try body first, fallback to raw_text
        const insertData: any = {
          workspace_id: inbound.workspace_id,
          campaign_id: inbound.campaign_id,
          from_email: inbound.from_email,
          from_name: null, // Can be extracted from email if needed
          subject: inbound.subject,
          intent: intentValue,
        };
        
        // Add body content (try different column names)
        if (bodySource) {
          insertData.body = bodySource;
          insertData.raw_text = bodySource;
        }
        
        const { data: newReply, error: createError } = await supabase
          .from("email_replies")
          .insert(insertData)
          .select("id")
          .single();

        if (createError) {
          console.error("Failed to create email_replies record:", createError);
        } else {
          replyId = newReply?.id ?? null;
        }
      }

      // Call process_reply_intent function
      if (replyId) {
        const { error: rpcError } = await supabase.rpc("process_reply_intent", {
          p_reply_id: replyId,
          p_intent: intentValue,
        });

        if (rpcError) {
          console.error("Failed to process reply intent:", rpcError);
          // Don't fail the request if RPC fails
        }
      }

      // Block 9600 — Smart Routing v1: Trigger routing for hot/warm leads
      if ((intentValue === "hot" || intentValue === "warm") && contactId && inbound.campaign_id) {
        try {
          // Get campaign to find account_id
          const { data: campaign } = await supabase
            .from("campaigns")
            .select("account_id")
            .eq("id", inbound.campaign_id)
            .single();

          if (campaign?.account_id) {
            // Extract AI summary and next action from classification result
            const aiSummary = result.raw?.summary || result.raw?.reason || null;
            const nextAction = result.raw?.next_action || 
              (intentValue === "hot" 
                ? "Call or email them immediately to schedule an estimate."
                : "Follow up with more information or answer their questions.");

            // Import and call routing helper directly
            const { processHotLeadRouting, processWarmLeadRouting } = await import("@/lib/routing/routingHelpers");
            
            const routingFunction = intentValue === "hot" 
              ? processHotLeadRouting 
              : processWarmLeadRouting;

            await routingFunction({
              accountId: campaign.account_id,
              campaignId: inbound.campaign_id,
              contactId,
              messageId: inbound.id,
              summary: aiSummary,
              nextAction,
              replyText: bodySource || null,
            }).catch((routingErr) => {
              console.error("Failed to trigger smart routing:", routingErr);
              // Don't fail the request if routing fails
            });
          }
        } catch (routingErr) {
          console.error("Failed to trigger smart routing:", routingErr);
          // Don't fail the request if routing fails
        }
      }
    }

    // 5) Return the classification (front-end already expects this)
    // Include v2 intelligence if available
    return NextResponse.json({
      ...result,
      intelligenceV2: intelligenceV2 ? {
        category: intelligenceV2.category,
        emotionalTone: intelligenceV2.emotionalTone,
        hasInsuranceIntent: intelligenceV2.hasInsuranceIntent,
        hasBookingIntent: intelligenceV2.hasBookingIntent,
        hasUrgentDamage: intelligenceV2.hasUrgentDamage,
        extractedQuestions: intelligenceV2.extractedQuestions,
        suggestedActions: intelligenceV2.suggestedActions,
        suggestedPipelineStage: intelligenceV2.suggestedPipelineStage,
        suggestedTags: intelligenceV2.suggestedTags,
        eventId: intelligenceV2.eventId,
      } : null,
    });
  } catch (err) {
    console.error("Reply intent classify error:", err);
    return NextResponse.json(
      { error: "Failed to classify reply intent" },
      { status: 500 }
    );
  }
}

// quick-and-dirty HTML stripper
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Map ReplyIntentLabel to workflow IntentLabel
function mapReplyIntentToWorkflowIntent(
  label: ReplyIntentLabel
): IntentLabel | null {
  switch (label) {
    case "interested":
    case "meeting_booked":
      return "hot_lead";
    case "question":
    case "neutral":
    case "referral":
      return "warm_lead";
    case "not_interested":
      return "not_interested";
    case "ooo":
      return "unknown";
    case "other":
    default:
      return "follow_up";
  }
}

// Map ReplyIntentLabel to process_reply_intent intent values (hot/warm/not_interested)
function mapClassifierLabelToIntent(
  label: ReplyIntentLabel
): "hot" | "warm" | "not_interested" | null {
  switch (label) {
    case "interested":
    case "meeting_booked":
      return "hot";
    case "question":
    case "neutral":
    case "referral":
      return "warm";
    case "not_interested":
      return "not_interested";
    case "ooo":
    case "other":
    default:
      return null; // Only process hot/warm/not_interested
  }
}


