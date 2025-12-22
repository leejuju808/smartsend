// Block 95000 — Localized Coaching Message Generator
// Generates market-specific coaching messages for roofing companies

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface RoofingContext {
  city: string | null;
  state: string | null;
  zip: string | null;
  focus: string | null;
  trade: string;
  market_tags: string[];
}

export interface BaseAction {
  key: string;
  description: string;
  title?: string;
}

/**
 * Fetches roofing context for a user from the edge function
 */
export async function fetchRoofingContextForUser(userId: string): Promise<RoofingContext> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/getRoofingContextForUser`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ user_id: userId }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch roofing context: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching roofing context:", error);
    // Return default context on error
    return {
      city: null,
      state: null,
      zip: null,
      focus: null,
      trade: "roofing",
      market_tags: [],
    };
  }
}

/**
 * Generates a localized coaching message based on user's market and action
 */
export async function generateLocalizedCoachingMessage(
  userId: string,
  baseAction: BaseAction
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    // Fallback to generic message if OpenAI not available
    return `Action: ${baseAction.title || baseAction.key} - ${baseAction.description}`;
  }

  try {
    // 1. Get roofing context
    const context = await fetchRoofingContextForUser(userId);
    const { city, state, focus, market_tags } = context;

    // 2. Build market-specific context string
    const locationContext = city && state 
      ? `${city}, ${state}`
      : state 
      ? state
      : "your area";

    const marketContext = market_tags.length > 0
      ? `Market characteristics: ${market_tags.join(", ")}. `
      : "";

    const focusContext = focus
      ? `Company focus: ${focus} roofs. `
      : "";

    // 3. Build the prompt
    const prompt = `You are an expert roofing sales coach.

User is a roofing company in ${locationContext}.
${focusContext}${marketContext}

Action to coach on: ${baseAction.key} - ${baseAction.description}

Write:
1) A 2-3 sentence explanation in plain roofer language about WHY this matters in this market.
2) A specific example they can use today (e.g., what kind of roofs/jobs to target, how to mention local weather, etc.)

Keep it direct, blue-collar, and practical. No fluff.

Format your response as plain text (no markdown, no JSON).`;

    // 4. Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are SmartSend AI, an expert roofing sales coach. You speak in plain, direct language that roofers understand. No corporate jargon, no fluff.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const message = completion.choices[0]?.message?.content;
    if (!message) {
      throw new Error("No response from OpenAI");
    }

    return message;
  } catch (error) {
    console.error("Error generating localized coaching:", error);
    // Fallback to generic message
    return `Action: ${baseAction.title || baseAction.key} - ${baseAction.description}`;
  }
}

/**
 * Gets playbook entries for a specific topic (by topic key)
 */
export async function getPlaybookEntries(topicKey: string) {
  try {
    // First get the topic by key
    const topicResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/roofing_playbook_topics?key=eq.${topicKey}&select=id`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!topicResponse.ok) {
      throw new Error(`Failed to fetch topic: ${topicResponse.statusText}`);
    }

    const topics = await topicResponse.json();
    if (!topics || topics.length === 0) {
      return [];
    }

    const topicId = topics[0].id;

    // Then get entries for that topic
    const entriesResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/roofing_playbook_entries?topic_id=eq.${topicId}&select=*`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!entriesResponse.ok) {
      throw new Error(`Failed to fetch playbook entries: ${entriesResponse.statusText}`);
    }

    return await entriesResponse.json();
  } catch (error) {
    console.error("Error fetching playbook entries:", error);
    return [];
  }
}

/**
 * Gets all playbook topics
 */
export async function getPlaybookTopics() {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/roofing_playbook_topics?select=*&order=title.asc`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch playbook topics: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching playbook topics:", error);
    return [];
  }
}


























