// Block 257000 — AI Office Admin Engine v1
// POST /api/office-admin/response-suggest
// AI Response Suggestion for Office Staff

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const {
      inbox_id,
      company_id,
      customer_name,
      customer_email,
      original_message,
      original_subject,
      context, // Additional context (job info, previous messages, etc.)
    } = body;

    if (!inbox_id || !original_message) {
      return NextResponse.json(
        { error: "Missing required fields: inbox_id, original_message" },
        { status: 400 }
      );
    }

    // Get inbox item for context
    const { data: inboxItem } = await supabase
      .from("office_inbox")
      .select("*")
      .eq("id", inbox_id)
      .single();

    if (!inboxItem) {
      return NextResponse.json(
        { error: "Inbox item not found" },
        { status: 404 }
      );
    }

    // Get company info for branding
    const { data: company } = await supabase
      .from("roofing_companies")
      .select("name, messaging_style")
      .eq("id", company_id || inboxItem.company_id)
      .single();

    // Get related job/lead info if available
    let jobInfo = "";
    let leadInfo = "";

    if (inboxItem.job_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("stage, contract_value, notes")
        .eq("id", inboxItem.job_id)
        .single();

      if (job) {
        jobInfo = `Job Stage: ${job.stage}, Contract Value: $${job.contract_value || "N/A"}`;
      }
    }

    if (inboxItem.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("first_name, last_name, address, city, state")
        .eq("id", inboxItem.lead_id)
        .single();

      if (lead) {
        leadInfo = `Customer: ${lead.first_name} ${lead.last_name}, Location: ${lead.city}, ${lead.state}`;
      }
    }

    // AI Response Generation
    const responsePrompt = `You are SmartSend's AI Response Assistant for a roofing company.

Generate a professional, helpful response to this customer message.

Company: ${company?.name || "Roofing Company"}
Messaging Style: ${company?.messaging_style || "casual"}

Original Message:
Subject: ${original_subject || "(no subject)"}
From: ${customer_name || customer_email || "Customer"}
Message: ${original_message}

${jobInfo ? `\nJob Context:\n${jobInfo}` : ""}
${leadInfo ? `\nCustomer Context:\n${leadInfo}` : ""}
${context ? `\nAdditional Context:\n${context}` : ""}

AI Analysis:
- Category: ${inboxItem.ai_category || "general"}
- Urgency: ${inboxItem.ai_urgency || "normal"}
- Sentiment: ${inboxItem.ai_sentiment || "neutral"}

Requirements:
1. Use a ${company?.messaging_style || "casual"} tone
2. Be polite, clear, and helpful
3. Address the customer's concern directly
4. Include specific next steps if applicable
5. Keep it concise (2-4 paragraphs max)
6. Use the customer's name if available: ${customer_name || "there"}

Generate a professional email response. Return ONLY the response text, no subject line, no explanations.`;

    const responseCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional customer service representative for a roofing company." },
        { role: "user", content: responsePrompt },
      ],
      temperature: 0.7,
    });

    const suggestedResponse = responseCompletion.choices[0]?.message?.content?.trim() || "";

    // Generate subject line if needed
    const subjectPrompt = `Generate a professional email subject line for this response. Keep it short (under 60 characters).

Original Subject: ${original_subject || "(no subject)"}
Response Category: ${inboxItem.ai_category || "general"}

Return ONLY the subject line, no other text.`;

    const subjectCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional email subject line writer." },
        { role: "user", content: subjectPrompt },
      ],
      temperature: 0.5,
    });

    const suggestedSubject = subjectCompletion.choices[0]?.message?.content?.trim() || 
      (original_subject?.startsWith("Re:") ? original_subject : `Re: ${original_subject || "Your message"}`);

    // Update inbox item with suggested response
    await supabase
      .from("office_inbox")
      .update({
        response_draft: suggestedResponse,
      })
      .eq("id", inbox_id);

    return NextResponse.json({
      success: true,
      suggested_subject: suggestedSubject,
      suggested_response: suggestedResponse,
      tone: company?.messaging_style || "casual",
    });
  } catch (error: any) {
    console.error("Error generating response suggestion:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate response suggestion" },
      { status: 500 }
    );
  }
}





















