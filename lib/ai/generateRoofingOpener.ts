// lib/ai/generateRoofingOpener.ts
// Block 15400: AI Personalization Engine v1
// Generates personalized roofing openers using LLM

type PersonalizationContext = {
  workspaceProfile: {
    company_name?: string | null;
    primary_city?: string | null;
    service_areas?: string[] | null;
    years_in_business?: number | null;
    core_services?: string[] | null;
    brand_tone?: "friendly" | "professional" | "direct" | "urgent";
  };
  contact: {
    first_name?: string | null;
    last_name?: string | null;
    city?: string | null;
    lead_source?: string | null;
    source_meta?: any;
  };
  campaign: {
    name: string;
    template_key?: string | null;
  };
  step: {
    subject: string;
  };
};

/**
 * Generates a personalized roofing opener (1-2 lines, max ~35 words)
 * Uses OpenAI or configured LLM provider
 */
export async function generateRoofingOpener(
  ctx: PersonalizationContext
): Promise<string> {
  const {
    workspaceProfile,
    contact,
    campaign,
    step,
  } = ctx;

  const name =
    contact.first_name?.trim() ||
    contact.last_name?.trim() ||
    "there";

  const city =
    contact.city?.trim() ||
    workspaceProfile.primary_city?.trim() ||
    "";

  const years = workspaceProfile.years_in_business || null;
  const services = workspaceProfile.core_services || [];
  const tone = workspaceProfile.brand_tone || "friendly";

  const leadSource = contact.lead_source || "unknown";
  const templateKey = campaign.template_key || "generic";

  const prompt = `
You are writing a short personalized opening line for a roofing contractor's cold email.

Constraints:
- 1–2 short sentences, max 35 words total.
- No fake claims (don't say you've inspected their roof).
- Mention the city if available.
- Write in a ${tone} but confident tone.
- Avoid emojis.
- Do NOT use their full address or anything too creepy.

Context:
- Company: ${workspaceProfile.company_name || "Local roofing company"}
- City: ${city || "N/A"}
- Years in business: ${years || "N/A"}
- Core services: ${services.join(", ") || "roofing services"}

Lead Source: ${leadSource}
Template Type: ${templateKey}
Email Subject: ${step.subject}
Contact First Name: ${name}

Examples of good openers:
- "We've been helping homeowners around Tacoma keep storm damage from turning into leaks. Wanted to quickly check in with you."
- "We do a lot of roof inspections in Spanaway and noticed many homes like yours could use a quick check before the rainy season really hits."

Now write one NEW opener for this homeowner.`;

  // Call LLM provider (OpenAI by default)
  const opener = await callLLM(prompt);

  return opener.trim();
}

/**
 * Calls the configured LLM provider to generate text
 * Defaults to OpenAI if OPENAI_API_KEY is set
 */
async function callLLM(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured. AI personalization requires an OpenAI API key.");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const endpoint = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/chat/completions";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are a professional email copywriter specializing in roofing contractor outreach. Return only the opener text, no explanations or markdown.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content returned from LLM");
    }

    // Clean up any markdown formatting that might slip through
    return content
      .replace(/^```[\w]*\n?/g, "")
      .replace(/```\n?$/g, "")
      .trim();
  } catch (error: any) {
    console.error("Failed to generate opener via LLM:", error);
    throw new Error(`LLM generation failed: ${error.message}`);
  }
}



























































