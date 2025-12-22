// Block 19900 — Facebook Lead Ads Webhook
// POST /api/lead-capture/facebook-webhook
// Handles Facebook Lead Ads webhook events

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Facebook webhook verification (GET)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  // Get workspace from verify_token (you can encode workspace_id in token)
  const workspaceId = searchParams.get("workspace_id");

  if (mode === "subscribe" && token && workspaceId) {
    // Verify token matches workspace config
    const { data: config } = await supabase
      .from("facebook_webhook_configs")
      .select("verify_token")
      .eq("workspace_id", workspaceId)
      .eq("verify_token", token)
      .single();

    if (config) {
      return new NextResponse(challenge, { status: 200 });
    }
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// Facebook webhook event handler (POST)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { entry } = body;

    if (!entry || !Array.isArray(entry)) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    // Process each entry
    for (const entryItem of entry) {
      const { changes } = entryItem;

      if (!changes || !Array.isArray(changes)) continue;

      for (const change of changes) {
        if (change.field === "leadgen") {
          await processFacebookLead(change.value);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error processing Facebook webhook:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Process Facebook lead
async function processFacebookLead(leadData: any) {
  try {
    const { leadgen_id, page_id, form_id, ad_id, ad_name, created_time } = leadData;

    // Get workspace from page_id (you'll need to map page_id to workspace_id)
    const workspaceId = await getWorkspaceFromPageId(page_id);
    if (!workspaceId) {
      console.error("No workspace found for page_id:", page_id);
      return;
    }

    // Fetch lead details from Facebook API
    const leadDetails = await fetchFacebookLeadDetails(leadgen_id, workspaceId);
    if (!leadDetails) {
      console.error("Failed to fetch lead details from Facebook");
      return;
    }

    // Extract lead information
    const email = leadDetails.email || "";
    const name = leadDetails.full_name || leadDetails.first_name || "";
    const phone = leadDetails.phone_number || "";
    const jobType = leadDetails.job_type || "";
    const address = leadDetails.address || "";

    if (!email) {
      console.error("No email in Facebook lead");
      return;
    }

    // Get or create contact
    const { data: contactId } = await supabase.rpc(
      "get_or_create_contact_from_form",
      {
        p_workspace_id: workspaceId,
        p_email: email,
        p_name: name,
        p_phone: phone,
        p_lead_source: "facebook_lead",
      }
    );

    if (!contactId) {
      console.error("Failed to create contact");
      return;
    }

    // Store Facebook lead
    const { data: fbLead, error: fbLeadError } = await supabase
      .from("facebook_lead_ads")
      .insert({
        workspace_id: workspaceId,
        contact_id: contactId,
        fb_lead_id: leadgen_id,
        ad_id,
        ad_name,
        form_id,
        form_name: leadDetails.form_name || "",
        lead_data: leadDetails,
      })
      .select()
      .single();

    if (fbLeadError) {
      console.error("Error storing Facebook lead:", fbLeadError);
      return;
    }

    // Create inbox thread
    const subject = `Facebook Lead: ${jobType || "New Lead"}`;
    const messageBody = [
      `New lead from Facebook Lead Ads`,
      "",
      `**Contact Information:**`,
      `- Name: ${name || "Not provided"}`,
      `- Email: ${email}`,
      `- Phone: ${phone || "Not provided"}`,
      `- Address: ${address || "Not provided"}`,
      "",
      `**Job Details:**`,
      `- Job Type: ${jobType || "Not specified"}`,
      "",
      `**Source:**`,
      `- Ad: ${ad_name || "Unknown"}`,
      `- Form: ${leadDetails.form_name || "Unknown"}`,
    ].join("\n");

    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .insert({
        workspace_id: workspaceId,
        contact_id: contactId,
        subject,
        status: "open",
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (!threadError && thread) {
      // Create initial message
      await supabase.from("inbox_messages").insert({
        thread_id: thread.id,
        sender: email,
        body: messageBody,
        sent_at: new Date().toISOString(),
        is_incoming: true,
      });

      // Update Facebook lead with thread_id
      await supabase
        .from("facebook_lead_ads")
        .update({ thread_id: thread.id, processed: true, processed_at: new Date().toISOString() })
        .eq("id", fbLead.id);

      // Run Smart Intake Parser
      await processSmartIntake({
        workspace_id: workspaceId,
        contact_id: contactId,
        thread_id: thread.id,
        source_type: "fb_lead",
        source_id: fbLead.id,
        submission_data: leadDetails,
      });

      // Auto-create tasks
      await createTasksForNewLead({
        workspace_id: workspaceId,
        contact_id: contactId,
        thread_id: thread.id,
        submission_data: leadDetails,
      });

      // Generate AI draft reply
      await generateAIDraftReply({
        workspace_id: workspaceId,
        thread_id: thread.id,
        contact_id: contactId,
        submission_data: leadDetails,
      });
    }
  } catch (error) {
    console.error("Error processing Facebook lead:", error);
  }
}

// Fetch lead details from Facebook Graph API
async function fetchFacebookLeadDetails(
  leadgenId: string,
  workspaceId: string
): Promise<any> {
  try {
    // Get Facebook config for workspace
    const { data: config } = await supabase
      .from("facebook_webhook_configs")
      .select("page_access_token")
      .eq("workspace_id", workspaceId)
      .single();

    if (!config?.page_access_token) {
      throw new Error("No Facebook access token found");
    }

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${leadgenId}?access_token=${config.page_access_token}`
    );

    if (!response.ok) {
      throw new Error(`Facebook API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching Facebook lead details:", error);
    return null;
  }
}

// Get workspace from Facebook page_id
async function getWorkspaceFromPageId(pageId: string): Promise<string | null> {
  // You'll need to store page_id -> workspace_id mapping
  // For now, return null - implement based on your setup
  const { data: config } = await supabase
    .from("facebook_webhook_configs")
    .select("workspace_id")
    .limit(1)
    .single();

  return config?.workspace_id || null;
}

// Helper functions (same as form-submit route)
async function processSmartIntake(params: any) {
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/lead-capture/smart-intake`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }
    );
  } catch (error) {
    console.error("Error calling Smart Intake Parser:", error);
  }
}

async function createTasksForNewLead(params: any) {
  try {
    await supabase.from("tasks").insert({
      workspace_id: params.workspace_id,
      contact_id: params.contact_id,
      thread_id: params.thread_id,
      title: "Follow up on Facebook lead",
      description: `New lead from Facebook Lead Ads`,
      priority: "high",
      status: "open",
      due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      auto_generated: true,
      auto_source: "facebook_lead",
    });
  } catch (error) {
    console.error("Error creating tasks:", error);
  }
}

async function generateAIDraftReply(params: any) {
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/inbox/ai-reply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: params.thread_id,
          contact_id: params.contact_id,
        }),
      }
    );
  } catch (error) {
    console.error("Error generating AI draft reply:", error);
  }
}



















































