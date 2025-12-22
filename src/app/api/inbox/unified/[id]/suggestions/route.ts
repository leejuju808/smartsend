import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { supabaseAdmin } from "@/lib/supabase/admin";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// GET /api/inbox/unified/[id]/suggestions - Get AI reply suggestions
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const messageId = params.id;

  try {
    // Get message and lead data
    const { data: message, error: messageError } = await supabaseAdmin
      .from("inbox_messages")
      .select(
        `
        id,
        subject,
        body,
        sender,
        sender_email,
        intent,
        lead_id,
        leads:lead_id (
          id,
          first_name,
          last_name,
          email
        )
        `
      )
      .eq("id", messageId)
      .eq("workspace_id", workspace_id)
      .single();

    if (messageError || !message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    const lead = message.leads as any;
    const leadName = lead
      ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.email
      : message.sender;

    // Generate AI reply suggestions
    const suggestions = await generateReplySuggestions(
      message.body || "",
      message.subject || "",
      message.intent || "general",
      leadName,
      message.sender_email
    );

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Error generating reply suggestions:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}

async function generateReplySuggestions(
  originalBody: string,
  originalSubject: string,
  intent: string,
  leadName: string,
  leadEmail: string
) {
  const systemPrompt = `You are an AI assistant helping roofing contractors write effective replies to homeowner messages.
Generate three reply options for each message:
1. Fast response - Short, decisive, gets to the point quickly
2. Relationship response - Warm, friendly, builds rapport
3. Close-the-deal response - Strong CTA, pushes for next step

Keep responses professional but conversational. Roofing contractors value speed and clarity.`;

  const userPrompt = `Original message from ${leadName} (${leadEmail}):
Subject: ${originalSubject}

${originalBody}

Intent classification: ${intent}

Generate three reply suggestions in JSON format:
{
  "fast": {
    "subject": "Re: [subject]",
    "body": "[short decisive reply]"
  },
  "relationship": {
    "subject": "Re: [subject]",
    "body": "[warm friendly reply]"
  },
  "close": {
    "subject": "Re: [subject]",
    "body": "[strong CTA reply]"
  }
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(responseText);

    return {
      fast: {
        type: "fast",
        label: "Fast Response",
        description: "Short and decisive",
        subject: parsed.fast?.subject || `Re: ${originalSubject}`,
        body: parsed.fast?.body || "",
      },
      relationship: {
        type: "relationship",
        label: "Relationship Response",
        description: "Warm and friendly",
        subject: parsed.relationship?.subject || `Re: ${originalSubject}`,
        body: parsed.relationship?.body || "",
      },
      close: {
        type: "close",
        label: "Close the Deal",
        description: "Strong CTA",
        subject: parsed.close?.subject || `Re: ${originalSubject}`,
        body: parsed.close?.body || "",
      },
    };
  } catch (error) {
    console.error("OpenAI error:", error);
    // Return fallback suggestions
    return {
      fast: {
        type: "fast",
        label: "Fast Response",
        description: "Short and decisive",
        subject: `Re: ${originalSubject}`,
        body: `Hi ${leadName},\n\nThanks for reaching out! I'd be happy to help.\n\nBest,\n[Your name]`,
      },
      relationship: {
        type: "relationship",
        label: "Relationship Response",
        description: "Warm and friendly",
        subject: `Re: ${originalSubject}`,
        body: `Hi ${leadName},\n\nI appreciate you taking the time to write. Let me help you with that.\n\nBest regards,\n[Your name]`,
      },
      close: {
        type: "close",
        label: "Close the Deal",
        description: "Strong CTA",
        subject: `Re: ${originalSubject}`,
        body: `Hi ${leadName},\n\nI'd love to help you move forward. Can we schedule a quick call to discuss this further?\n\nBest,\n[Your name]`,
      },
    };
  }
}


































