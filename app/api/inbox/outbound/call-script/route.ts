// API endpoint for AI call script generation
// POST /api/inbox/outbound/call-script

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
      contactId,
      leadSource,
      jobType,
      neighborhood,
      stormEvents,
      pastInteraction,
      tonePreference = "professional",
    } = body;

    if (!contactId) {
      return NextResponse.json({ error: "Contact ID is required" }, { status: 400 });
    }

    // Load contact and related data
    const { data: contact } = await supabase
      .from("contacts")
      .select("first_name, last_name, company, email, phone, city, state")
      .eq("id", contactId)
      .single();

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Load past interactions if available
    let interactionHistory = "";
    if (pastInteraction) {
      interactionHistory = pastInteraction;
    } else {
      // Try to load recent messages/threads
      const { data: threads } = await supabase
        .from("inbox_threads")
        .select("id, last_message_at")
        .eq("contact_id", contactId)
        .order("last_message_at", { ascending: false })
        .limit(1);

      if (threads && threads.length > 0) {
        interactionHistory = "Has previous interaction";
      }
    }

    const systemPrompt = `You are SmartSend's AI Call Script Generator for roofing contractors.

Your job: Generate a short, natural call script (30-60 seconds) that:
- Sounds conversational, not scripted
- Gets straight to the point
- Uses the contractor's name naturally
- Focuses on booking an inspection or answering questions
- Includes a clear next step

Format:
- Opening: Brief introduction
- Hook: Why you're calling
- Value: What you can offer
- CTA: Clear next step

Keep it under 60 seconds when spoken.`;

    const userPrompt = `Contact: ${contact.first_name || ""} ${contact.last_name || ""}
Location: ${contact.city || ""}, ${contact.state || ""}
${leadSource ? `Lead Source: ${leadSource}` : ""}
${jobType ? `Job Type: ${jobType}` : ""}
${neighborhood ? `Neighborhood: ${neighborhood}` : ""}
${stormEvents ? `Storm Events: ${stormEvents}` : ""}
${interactionHistory ? `Past Interaction: ${interactionHistory}` : ""}
Tone: ${tonePreference}

Generate a natural call script for this roofing outreach.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 300,
    });

    const script = completion.choices[0]?.message?.content?.trim() || "";

    return NextResponse.json({
      script,
      contactName: `${contact.first_name || ""} ${contact.last_name || ""}`.trim(),
    });
  } catch (error: any) {
    console.error("Error generating call script:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate call script" },
      { status: 500 }
    );
  }
}



















































