// Block 11000 — Step 4: One-Click Campaign Launch API
// POST /api/onboarding/step-4-launch

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { campaignName, listId, templateId } = body;

    // Get user's workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const workspaceId = membership?.workspace_id;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "No workspace found for user" },
        { status: 400 }
      );
    }

    // Get sending identity
    const { data: sendingIdentity } = await supabase
      .from("sending_identities")
      .select()
      .eq("workspace_id", workspaceId)
      .eq("is_default", true)
      .single();

    if (!sendingIdentity) {
      return NextResponse.json(
        { error: "No sending email configured. Please complete step 2." },
        { status: 400 }
      );
    }

    // Get contact list (default to "Old Quotes" if not provided)
    let contactList;
    if (listId) {
      const { data: list } = await supabase
        .from("contact_lists")
        .select()
        .eq("id", listId)
        .eq("workspace_id", workspaceId)
        .single();
      contactList = list;
    } else {
      const { data: defaultList } = await supabase
        .from("contact_lists")
        .select()
        .eq("workspace_id", workspaceId)
        .eq("name", "Old Quotes")
        .single();
      contactList = defaultList;
    }

    if (!contactList) {
      return NextResponse.json(
        { error: "No contact list found. Please complete step 3." },
        { status: 400 }
      );
    }

    // Get contacts from list
    const { data: listMembers } = await supabase
      .from("contact_list_members")
      .select("contact_id")
      .eq("list_id", contactList.id);

    if (!listMembers || listMembers.length === 0) {
      return NextResponse.json(
        { error: "Contact list is empty. Please import contacts first." },
        { status: 400 }
      );
    }

    const contactIds = listMembers.map((m) => m.contact_id);

    // Get roofing reactivation template (or use provided templateId)
    let template;
    if (templateId) {
      const { data: customTemplate } = await supabase
        .from("roofing_templates")
        .select(
          `
          id,
          name,
          roofing_template_steps (
            id,
            step_order,
            delay_days,
            subject,
            body
          )
        `
        )
        .eq("id", templateId)
        .single();
      template = customTemplate;
    }

    // If no template provided, use default "Reactivation" template
    if (!template) {
      const { data: defaultTemplate } = await supabase
        .from("roofing_templates")
        .select(
          `
          id,
          name,
          roofing_template_steps (
            id,
            step_order,
            delay_days,
            subject,
            body
          )
        `
        )
        .eq("recommended_for", "reactivation")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      template = defaultTemplate;
    }

    // If still no template, create a default reactivation sequence
    if (!template || !template.roofing_template_steps || template.roofing_template_steps.length === 0) {
      template = {
        id: null,
        name: "Old Quotes Reactivation",
        roofing_template_steps: [
          {
            step_order: 1,
            delay_days: 0,
            subject: "Quick check-in about your roof estimate",
            body: "Hi {{first_name}},\n\nI wanted to follow up on the roof estimate we sent you. Have you had a chance to review it?\n\nIf you have any questions or want to schedule a time to discuss, just reply to this email.\n\nThanks,\n{{owner_name}}",
          },
          {
            step_order: 2,
            delay_days: 2,
            subject: "Still interested in your roof project?",
            body: "Hi {{first_name}},\n\nJust checking in to see if you're still considering your roof project. We're here to help if you have any questions.\n\nBest,\n{{owner_name}}",
          },
          {
            step_order: 3,
            delay_days: 4,
            subject: "Final follow-up",
            body: "Hi {{first_name}},\n\nThis is my last follow-up. If you're still interested in moving forward with your roof project, please let me know.\n\nThanks,\n{{owner_name}}",
          },
        ],
      };
    }

    // Sort template steps by step_order
    const sortedSteps = [...(template.roofing_template_steps || [])].sort(
      (a, b) => a.step_order - b.step_order
    );

    // Create campaign
    const campaignNameToUse = campaignName || "Old Quotes Reactivation";
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        workspace_id: workspaceId,
        name: campaignNameToUse,
        title: campaignNameToUse,
        subject: sortedSteps[0]?.subject || "Quick check-in about your roof estimate",
        body_template: sortedSteps[0]?.body || "",
        status: "active",
        daily_cap: 50,
        send_start: "09:00",
        created_by: user.id,
      })
      .select()
      .single();

    if (campaignError) {
      console.error("Error creating campaign:", campaignError);
      return NextResponse.json(
        { error: "Failed to create campaign" },
        { status: 500 }
      );
    }

    // Schedule initial batch (first 10 contacts immediately, rest spread out)
    const now = new Date();
    const scheduled = await scheduleInitialBatch(
      supabase,
      campaign.id,
      contactIds,
      sortedSteps,
      now,
      user.id
    );

    // Update onboarding status
    const { error: updateError } = await supabase
      .from("onboarding_status")
      .update({ step_4_done: true })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error updating onboarding status:", updateError);
    }

    return NextResponse.json(
      {
        success: true,
        campaign,
        scheduled,
        message: `Campaign "${campaignNameToUse}" launched successfully. ${scheduled} emails scheduled.`,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in step-4-launch:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

// Helper function to schedule initial batch
async function scheduleInitialBatch(
  supabase: any,
  campaignId: string,
  contactIds: string[],
  steps: Array<{ step_order: number; delay_days: number; subject: string; body: string }>,
  startTime: Date,
  userId: string
): Promise<number> {
  let scheduled = 0;
  const batchSize = Math.min(10, contactIds.length); // First 10 immediately

  // Try to get user_id from auth context
  const queueData: any = {
    campaign_id: campaignId,
    subject: steps[0]?.subject || "",
    body: steps[0]?.body || "",
    status: "queued",
  };

  // Add user_id if available (for schemas that require it)
  if (userId) {
    queueData.user_id = userId;
  }

  // Schedule first batch (immediate)
  for (let i = 0; i < batchSize; i++) {
    const contactId = contactIds[i];
    const sendAt = new Date(startTime);
    sendAt.setSeconds(sendAt.getSeconds() + i * 30); // Spread 30 seconds apart

    // Try different schema variations
    const insertData = {
      ...queueData,
      contact_id: contactId,
      scheduled_at: sendAt.toISOString(),
      send_at: sendAt.toISOString(), // Some schemas use send_at
      sequence_step: 1,
      step_number: 1,
      step_no: 1,
    };

    // Try insert with contact_id first (most common)
    let { error: step1Error } = await supabase
      .from("send_queue")
      .insert(insertData);

    // If that fails, try with lead_id instead
    if (step1Error) {
      const { error: leadError } = await supabase
        .from("send_queue")
        .insert({
          ...queueData,
          lead_id: contactId, // Some schemas use lead_id
          scheduled_at: sendAt.toISOString(),
          send_at: sendAt.toISOString(),
          sequence_step: 1,
        });

      if (leadError) {
        console.error("Error scheduling contact:", leadError);
        continue;
      }
    }

    scheduled++;

    // Schedule follow-ups (only if no reply)
    if (steps.length > 1) {
      const step2Time = new Date(sendAt);
      step2Time.setDate(step2Time.getDate() + (steps[1]?.delay_days || 2));

      await supabase.from("send_queue").insert({
        ...queueData,
        contact_id: contactId,
        lead_id: contactId,
        subject: steps[1]?.subject || "",
        body: steps[1]?.body || "",
        scheduled_at: step2Time.toISOString(),
        send_at: step2Time.toISOString(),
        status: "queued",
        sequence_step: 2,
        step_number: 2,
        step_no: 2,
      });

      if (steps.length > 2) {
        const step3Time = new Date(sendAt);
        step3Time.setDate(step3Time.getDate() + (steps[2]?.delay_days || 4));

        await supabase.from("send_queue").insert({
          ...queueData,
          contact_id: contactId,
          lead_id: contactId,
          subject: steps[2]?.subject || "",
          body: steps[2]?.body || "",
          scheduled_at: step3Time.toISOString(),
          send_at: step3Time.toISOString(),
          status: "queued",
          sequence_step: 3,
          step_number: 3,
          step_no: 3,
        });
      }
    }
  }

  // Schedule remaining contacts (spread over next few days)
  for (let i = batchSize; i < contactIds.length; i++) {
    const contactId = contactIds[i];
    const daysOffset = Math.floor((i - batchSize) / 10); // 10 per day
    const sendAt = new Date(startTime);
    sendAt.setDate(sendAt.getDate() + daysOffset);
    sendAt.setHours(9 + ((i - batchSize) % 10), 0, 0, 0); // Spread throughout day

    await supabase.from("send_queue").insert({
      ...queueData,
      contact_id: contactId,
      lead_id: contactId,
      subject: steps[0]?.subject || "",
      body: steps[0]?.body || "",
      scheduled_at: sendAt.toISOString(),
      send_at: sendAt.toISOString(),
      status: "queued",
      sequence_step: 1,
      step_number: 1,
      step_no: 1,
    });

    scheduled++;
  }

  return scheduled;
}

