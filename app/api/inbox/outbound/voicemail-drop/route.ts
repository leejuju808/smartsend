// API endpoint for voicemail drop
// POST /api/inbox/outbound/voicemail-drop

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { normalizePhoneNumber } from "@/lib/providers/sms";

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
    const { contactIds, recordingUrl, transcription } = body;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json(
        { error: "Contact IDs are required" },
        { status: 400 }
      );
    }

    if (!recordingUrl) {
      return NextResponse.json(
        { error: "Recording URL is required" },
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

    // Load contacts
    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from("contacts")
      .select("id, phone, sms_opt_out")
      .in("id", contactIds)
      .eq("workspace_id", workspaceId);

    if (contactsError || !contacts || contacts.length === 0) {
      return NextResponse.json({ error: "Contacts not found" }, { status: 404 });
    }

    const results = [];

    // Process each contact
    for (const contact of contacts) {
      try {
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
            error: "Contact opted out",
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

        // Create voicemail drop record
        const { data: voicemailDrop, error: dropError } = await supabaseAdmin
          .from("voicemail_drops")
          .insert({
            workspace_id: workspaceId,
            contact_id: contact.id,
            recording_url: recordingUrl,
            transcription: transcription || null,
            status: "queued",
            created_by: user.id,
          })
          .select()
          .single();

        if (dropError) {
          results.push({
            contactId: contact.id,
            success: false,
            error: dropError.message,
          });
          continue;
        }

        // Create outbound log
        await supabaseAdmin.from("outbound_logs").insert({
          workspace_id: workspaceId,
          contact_id: contact.id,
          channel: "voicemail",
          message: transcription || "Voicemail drop",
          status: "queued",
          ai_outreach_pack_id: "voicemail_drop",
          created_by: user.id,
          metadata: {
            voicemail_drop_id: voicemailDrop.id,
            recording_url: recordingUrl,
          },
        });

        // TODO: Integrate with Twilio or other voicemail drop service
        // For now, we'll mark it as queued and the actual drop would happen via a background job
        // Example Twilio integration:
        // const twilioClient = require('twilio')(accountSid, authToken);
        // await twilioClient.calls.create({
        //   to: normalizedPhone,
        //   from: twilioNumber,
        //   url: recordingUrl, // Twilio will call this URL and play the recording
        //   statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/voicemail-status`,
        // });

        results.push({
          contactId: contact.id,
          success: true,
          voicemailDropId: voicemailDrop.id,
        });
      } catch (error: any) {
        results.push({
          contactId: contact.id,
          success: false,
          error: error.message || "Unknown error",
        });
      }
    }

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
    console.error("Error sending voicemail drop:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send voicemail drop" },
      { status: 500 }
    );
  }
}



















































