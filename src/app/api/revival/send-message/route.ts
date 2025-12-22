// Block 35333 — Send Revival Message
// Generates AI-powered revival message and sends to lead

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSMS, normalizePhoneNumber } from "@/lib/providers/sms";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiApiKey = process.env.OPENAI_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const { leadId, sequenceLevel = 1, workspaceId, channel = "sms" } = await req.json();

    if (!leadId || !workspaceId) {
      return NextResponse.json(
        { error: "leadId and workspaceId are required" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get lead details
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select(
        `
        *,
        workspace:workspaces(id, name, sms_number, sms_provider, sms_credentials)
        `
      )
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    if (lead.workspace_id !== workspaceId) {
      return NextResponse.json(
        { error: "Lead does not belong to workspace" },
        { status: 403 }
      );
    }

    // Get workspace SMS settings
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("sms_number, sms_provider, sms_credentials, org_id")
      .eq("id", workspaceId)
      .single();

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Generate AI-powered revival message
    const message = await generateRevivalMessage({
      lead,
      sequenceLevel,
      workspaceId,
    });

    if (!message) {
      return NextResponse.json(
        { error: "Failed to generate revival message" },
        { status: 500 }
      );
    }

    // Send message based on channel
    let externalMessageId: string | null = null;
    let sentAt: string | null = null;
    let status: string = "failed";

    if (channel === "sms") {
      if (!lead.phone) {
        return NextResponse.json(
          { error: "Lead has no phone number" },
          { status: 400 }
        );
      }

      const normalizedPhone = normalizePhoneNumber(lead.phone);
      if (!normalizedPhone) {
        return NextResponse.json(
          { error: "Invalid phone number format" },
          { status: 400 }
        );
      }

      // Get organization for SMS sending
      const { data: org } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", workspace.org_id)
        .single();

      if (!org) {
        return NextResponse.json(
          { error: "Organization not found" },
          { status: 404 }
        );
      }

      const smsResult = await sendSMS(normalizedPhone, message, {
        provider: (org.sms_provider || workspace.sms_provider) as "twilio" | "nexmo" | "telnyx",
        credentials: (org.sms_credentials || workspace.sms_credentials) as any,
      });

      if (smsResult.success) {
        externalMessageId = smsResult.providerMessageId || null;
        sentAt = new Date().toISOString();
        status = "sent";
      } else {
        return NextResponse.json(
          { error: "Failed to send SMS", details: smsResult.error },
          { status: 500 }
        );
      }
    } else if (channel === "email") {
      // Email sending logic (similar to SMS but using email provider)
      // For now, we'll just mark it as sent - actual email integration would go here
      sentAt = new Date().toISOString();
      status = "sent";
    }

    // Find the latest revival event for this lead
    const { data: revivalEvent } = await supabase
      .from("revival_events")
      .select("id")
      .eq("lead_id", leadId)
      .eq("processed", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Log revival sequence
    const { data: sequence, error: sequenceError } = await supabase
      .from("revival_sequences")
      .insert({
        lead_id: leadId,
        workspace_id: workspaceId,
        sequence_level: sequenceLevel,
        message,
        channel,
        status,
        sent_at: sentAt,
        external_message_id: externalMessageId,
        revival_event_id: revivalEvent?.id || null,
      })
      .select()
      .single();

    if (sequenceError) {
      console.error("Error logging revival sequence:", sequenceError);
      // Don't fail the request, message was sent
    }

    // Mark revival event as processed if exists
    if (revivalEvent) {
      await supabase
        .from("revival_events")
        .update({ processed: true })
        .eq("id", revivalEvent.id);
    }

    return NextResponse.json({
      success: true,
      message,
      sequenceId: sequence?.id,
      status,
      sentAt,
    });
  } catch (error: any) {
    console.error("Error sending revival message:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

async function generateRevivalMessage({
  lead,
  sequenceLevel,
  workspaceId,
}: {
  lead: any;
  sequenceLevel: number;
  workspaceId: string;
}): Promise<string | null> {
  if (!openaiApiKey) {
    // Fallback to template-based message if OpenAI not available
    return generateTemplateMessage({ lead, sequenceLevel });
  }

  try {
    const leadName = lead.name || lead.first_name || "there";
    const address = lead.address || lead.city || "your area";
    const proposalAmount = lead.proposal_amount
      ? `$${lead.proposal_amount.toLocaleString()}`
      : null;

    const levelPrompts: Record<number, string> = {
      1: "Create a short, friendly check-in message to revive a dead roofing lead. Keep it light and non-pushy. Under 2 sentences. NO emojis.",
      2: "Create a value-based revival message mentioning that you just finished a similar home in their area. Offer photos or an updated quote. Professional tone, under 2 sentences. NO emojis.",
      3: "Create a contextual revival message. If they had an insurance claim that stalled, offer to help get them moving again. Ask if they want to talk today. Professional and helpful tone, under 2 sentences. NO emojis.",
      4: "Create a final last-chance revival message. Tell them you'll archive their estimate unless they want to keep it active. Ask them to just reply YES if interested. Professional, respectful tone, under 2 sentences. NO emojis.",
    };

    const prompt = `${levelPrompts[sequenceLevel] || levelPrompts[1]}

Homeowner details:
- Name: ${leadName}
- Property address: ${address || "not provided"}
- Proposal amount: ${proposalAmount || "unknown"}
- Days since last activity: ${lead.days_inactive || "unknown"}

Generate the message now:`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || null;
  } catch (error: any) {
    console.error("Error generating AI message:", error);
    // Fallback to template
    return generateTemplateMessage({ lead, sequenceLevel });
  }
}

function generateTemplateMessage({
  lead,
  sequenceLevel,
}: {
  lead: any;
  sequenceLevel: number;
}): string {
  const name = lead.name || lead.first_name || "";
  const address = lead.address || lead.city || "your area";

  const templates: Record<number, string> = {
    1: `Hey ${name}, just checking if you're still considering roofing work at ${address}. Want us to resend your estimate?`,
    2: `We just finished a similar home in your area — want photos or a quick updated quote?`,
    3: `If your insurance claim stalled, I can help get you moving again. Want to talk today?`,
    4: `We'll archive your estimate unless you want us to keep it active. Just reply YES.`,
  };

  return templates[sequenceLevel] || templates[1];
}
































