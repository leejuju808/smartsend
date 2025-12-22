// API endpoint for sending outbound messages
// POST /api/inbox/outbound/send

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSMS, normalizePhoneNumber } from "@/lib/providers/sms";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      channel,
      contactIds,
      message,
      subject,
      scheduledAt,
      multistepSequence,
      aiOutreachPackId,
      aiOutreachAngle,
    } = body;

    if (!channel || !contactIds || !Array.isArray(contactIds) || contactIds.length === 0 || !message) {
      return NextResponse.json(
        { error: "Missing required fields: channel, contactIds, message" },
        { status: 400 }
      );
    }

    // Get workspace_id
    const { data: membership } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const workspaceId = membership?.workspace_id;

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
    }

    // Check rate limits
    const { data: rateLimitCheck } = await supabaseAdmin.rpc("check_outbound_rate_limit", {
      p_workspace_id: workspaceId,
      p_channel: channel === "multi_step" ? "email" : channel, // Use email for multi-step
    });

    if (!rateLimitCheck) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    // Load contacts
    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from("contacts")
      .select("id, email, phone, first_name, last_name, sms_opt_out")
      .in("id", contactIds)
      .eq("workspace_id", workspaceId);

    if (contactsError || !contacts || contacts.length === 0) {
      return NextResponse.json({ error: "Contacts not found" }, { status: 404 });
    }

    const results = [];

    // Process each contact
    for (const contact of contacts) {
      try {
        if (channel === "email") {
          // Send email
          if (!contact.email) {
            results.push({
              contactId: contact.id,
              success: false,
              error: "No email address",
            });
            continue;
          }

          // Check suppression
          const { data: suppressed } = await supabaseAdmin
            .from("suppression_list")
            .select("id")
            .eq("email", contact.email.toLowerCase())
            .maybeSingle();

          if (suppressed) {
            results.push({
              contactId: contact.id,
              success: false,
              error: "Email is suppressed",
            });
            continue;
          }

          // Create outbound log
          const { data: outboundLog, error: logError } = await supabaseAdmin
            .from("outbound_logs")
            .insert({
              workspace_id: workspaceId,
              contact_id: contact.id,
              channel: "email",
              message,
              subject: subject || "",
              status: scheduledAt ? "pending" : "queued",
              scheduled_at: scheduledAt || null,
              ai_outreach_pack_id: aiOutreachPackId,
              ai_outreach_angle: aiOutreachAngle,
              created_by: user.id,
            })
            .select()
            .single();

          if (logError) {
            results.push({
              contactId: contact.id,
              success: false,
              error: logError.message,
            });
            continue;
          }

          // Send email via existing email send endpoint
          if (!scheduledAt) {
            const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/inbox/send`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: req.headers.get("cookie") || "",
              },
              body: JSON.stringify({
                to: contact.email,
                subject: subject || "",
                body: message,
                contact_id: contact.id,
              }),
            });

            if (emailResponse.ok) {
              await supabaseAdmin
                .from("outbound_logs")
                .update({
                  status: "sent",
                  sent_at: new Date().toISOString(),
                })
                .eq("id", outboundLog.id);
            }
          }

          results.push({
            contactId: contact.id,
            success: true,
            outboundLogId: outboundLog.id,
          });
        } else if (channel === "sms") {
          // Send SMS
          if (!contact.phone) {
            results.push({
              contactId: contact.id,
              success: false,
              error: "No phone number",
            });
            continue;
          }

          if (contact.sms_opt_out) {
            results.push({
              contactId: contact.id,
              success: false,
              error: "Contact opted out of SMS",
            });
            continue;
          }

          const normalizedPhone = normalizePhoneNumber(contact.phone);
          if (!normalizedPhone) {
            results.push({
              contactId: contact.id,
              success: false,
              error: "Invalid phone number",
            });
            continue;
          }

          // Create outbound log
          const { data: outboundLog, error: logError } = await supabaseAdmin
            .from("outbound_logs")
            .insert({
              workspace_id: workspaceId,
              contact_id: contact.id,
              channel: "sms",
              message,
              status: scheduledAt ? "pending" : "queued",
              scheduled_at: scheduledAt || null,
              ai_outreach_pack_id: aiOutreachPackId,
              ai_outreach_angle: aiOutreachAngle,
              created_by: user.id,
            })
            .select()
            .single();

          if (logError) {
            results.push({
              contactId: contact.id,
              success: false,
              error: logError.message,
            });
            continue;
          }

          // Send SMS via existing SMS endpoint
          if (!scheduledAt) {
            const smsResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/inbox/sms/send`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: req.headers.get("cookie") || "",
              },
              body: JSON.stringify({
                to: normalizedPhone,
                message,
                contactId: contact.id,
                workspace_id: workspaceId,
              }),
            });

            if (smsResponse.ok) {
              await supabaseAdmin
                .from("outbound_logs")
                .update({
                  status: "sent",
                  sent_at: new Date().toISOString(),
                })
                .eq("id", outboundLog.id);
            }
          }

          results.push({
            contactId: contact.id,
            success: true,
            outboundLogId: outboundLog.id,
          });
        } else if (channel === "multi_step") {
          // Multi-step sequence
          const sequenceType = multistepSequence || "sms_then_email";

          // Create first step
          const firstChannel = sequenceType === "sms_then_email" ? "sms" : "email";
          const secondChannel = sequenceType === "sms_then_email" ? "email" : "sms";

          // Create parent outbound log for tracking
          const { data: parentLog } = await supabaseAdmin
            .from("outbound_logs")
            .insert({
              workspace_id: workspaceId,
              contact_id: contact.id,
              channel: "multi_step",
              message,
              subject: subject || "",
              is_multistep: true,
              multistep_sequence_type: sequenceType,
              multistep_step_number: 0, // Parent
              status: "queued",
              ai_outreach_pack_id: aiOutreachPackId,
              ai_outreach_angle: aiOutreachAngle,
              created_by: user.id,
            })
            .select()
            .single();

          // Schedule first step
          const firstStepScheduledAt = scheduledAt || new Date().toISOString();
          await supabaseAdmin.from("outbound_logs").insert({
            workspace_id: workspaceId,
            contact_id: contact.id,
            channel: firstChannel,
            message,
            subject: firstChannel === "email" ? subject : undefined,
            is_multistep: true,
            multistep_sequence_type: sequenceType,
            multistep_step_number: 1,
            status: "queued",
            scheduled_at: firstStepScheduledAt,
            ai_outreach_pack_id: aiOutreachPackId,
            ai_outreach_angle: aiOutreachAngle,
            created_by: user.id,
          });

          // Schedule second step
          const secondStepDelay = sequenceType === "sms_then_email" ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000; // 24 hours or 2 hours
          const secondStepScheduledAt = new Date(
            new Date(firstStepScheduledAt).getTime() + secondStepDelay
          ).toISOString();

          await supabaseAdmin.from("outbound_logs").insert({
            workspace_id: workspaceId,
            contact_id: contact.id,
            channel: secondChannel,
            message,
            subject: secondChannel === "email" ? subject : undefined,
            is_multistep: true,
            multistep_sequence_type: sequenceType,
            multistep_step_number: 2,
            status: "pending",
            scheduled_at: secondStepScheduledAt,
            ai_outreach_pack_id: aiOutreachPackId,
            ai_outreach_angle: aiOutreachAngle,
            created_by: user.id,
          });

          results.push({
            contactId: contact.id,
            success: true,
            outboundLogId: parentLog?.id,
          });
        }
      } catch (error: any) {
        results.push({
          contactId: contact.id,
          success: false,
          error: error.message || "Unknown error",
        });
      }
    }

    // Increment rate limit counter
    await supabaseAdmin.rpc("increment_outbound_rate_limit", {
      p_workspace_id: workspaceId,
      p_channel: channel === "multi_step" ? "email" : channel,
    });

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: results.length,
        success: successCount,
        failed: failCount,
      },
    });
  } catch (error: any) {
    console.error("Error sending outbound:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send outbound" },
      { status: 500 }
    );
  }
}



















































