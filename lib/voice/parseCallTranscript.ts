// Block 130000 — SmartSend AI Voice Assistant — Lead Extraction from Call Transcript
// Extracts structured homeowner data from phone call transcripts using OpenAI

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface ExtractedLeadInfo {
  name: string | null;
  address: string | null;
  issue: string | null;
  urgency: "urgent" | "normal" | "low" | null;
  insurance: "yes" | "no" | "unknown" | null;
  preferredTime: string | null;
}

/**
 * Parse call transcript and extract structured lead information
 */
export async function parseCallTranscript(
  transcript: string
): Promise<ExtractedLeadInfo> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a lead extraction system for a roofing company.
Extract structured information from this phone call transcript between an AI assistant and a homeowner.

Return ONLY valid JSON with these exact fields:
{
  "name": "full name or null",
  "address": "full address (street, city, state, zip) or null",
  "issue": "roof problem description or null",
  "urgency": "urgent/normal/low or null",
  "insurance": "yes/no/unknown or null",
  "preferredTime": "preferred appointment time/date or null"
}

Be thorough - extract all available information.`,
        },
        {
          role: "user",
          content: transcript,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3, // Lower temperature for more consistent extraction
    });

    const extracted = JSON.parse(
      completion.choices[0].message.content || "{}"
    );

    return {
      name: extracted.name || null,
      address: extracted.address || null,
      issue: extracted.issue || null,
      urgency: extracted.urgency || null,
      insurance: extracted.insurance || null,
      preferredTime: extracted.preferredTime || null,
    };
  } catch (error) {
    console.error("Error parsing call transcript:", error);
    return {
      name: null,
      address: null,
      issue: null,
      urgency: null,
      insurance: null,
      preferredTime: null,
    };
  }
}


























