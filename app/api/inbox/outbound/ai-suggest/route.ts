// API endpoint for AI message suggestions
// POST /api/inbox/outbound/ai-suggest

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
    const { channel, message, contactIds } = body;

    if (!channel) {
      return NextResponse.json({ error: "Channel is required" }, { status: 400 });
    }

    // Load contact context if contactIds provided
    let contactContext = "";
    if (contactIds && contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("first_name, last_name, company, email")
        .in("id", contactIds)
        .limit(5);

      if (contacts && contacts.length > 0) {
        contactContext = contacts
          .map(
            (c) =>
              `${c.first_name || ""} ${c.last_name || ""} (${c.email})${c.company ? ` - ${c.company}` : ""}`
          )
          .join(", ");
      }
    }

    const systemPrompt = `You are SmartSend's AI Outreach Assistant for roofing contractors.

Your job: Generate short, direct, contractor-style messages that:
- Get straight to the point (no fluff)
- Use blue-collar, friendly but professional tone
- Focus on booking an appointment or answering questions
- Are 2-4 sentences max for SMS, 3-5 sentences for email
- Sound like a real contractor, not a salesperson

Rules:
- Keep it conversational but professional
- Use {{first_name}} placeholder for personalization
- For SMS: max 160 characters recommended
- For email: include a clear subject line
- End with a clear next step`;

    const userPrompt = `Channel: ${channel}
${contactContext ? `Contacts: ${contactContext}` : ""}
${message ? `Current message draft: ${message}` : "Generate a new message"}

Generate a ${channel === "sms" ? "short SMS message" : "professional email"} for roofing outreach.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: channel === "sms" ? 100 : 200,
    });

    const suggestion = completion.choices[0]?.message?.content?.trim() || "";

    // Extract subject if it's an email
    let subject = "";
    let body = suggestion;
    if (channel === "email" && suggestion.includes("Subject:")) {
      const parts = suggestion.split("Subject:");
      subject = parts[1]?.split("\n")[0]?.trim() || "";
      body = parts[0]?.trim() || suggestion;
    }

    return NextResponse.json({
      suggestion: body,
      subject: subject || undefined,
    });
  } catch (error: any) {
    console.error("Error generating AI suggestion:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}



















































