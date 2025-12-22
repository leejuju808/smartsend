import OpenAI from "openai";

export interface FeedbackRow {
  tone: string;
  engagement_score: number;
  positive_rate: number;
  message_count: number;
}

export interface TunedGuidelines {
  tone: string;
  guidelines: string;
  recommendations: string[];
}

/**
 * Tunes rewrite prompts based on feedback data
 * Analyzes top and bottom performers to generate improved tone-specific guidelines
 */
export async function tuneRewritePrompt(
  openai: OpenAI,
  feedbackRows: FeedbackRow[]
): Promise<string> {
  if (feedbackRows.length === 0) {
    return JSON.stringify({ message: "No feedback data available" });
  }

  // Sort by engagement score
  const sorted = [...feedbackRows].sort((a, b) => b.engagement_score - a.engagement_score);
  const top = sorted.slice(0, 5);
  const bottom = sorted.slice(-5);

  const summary = {
    best: top.map((x) => ({
      tone: x.tone,
      score: x.engagement_score,
      positive: x.positive_rate,
      samples: x.message_count,
    })),
    worst: bottom.map((x) => ({
      tone: x.tone,
      score: x.engagement_score,
      positive: x.positive_rate,
      samples: x.message_count,
    })),
  };

  const prompt = `You are refining rewrite guidelines for SmartSend AI follow-up emails.

Here are recent results (higher engagement = better):

Best performers:
${JSON.stringify(summary.best, null, 2)}

Worst performers:
${JSON.stringify(summary.worst, null, 2)}

Rewrite rules to improve lower-performing tones:
- Keep merge tags like {{first_name}} intact.
- Adjust sentence rhythm and CTA phrasing according to engagement differences.
- Focus on what makes top performers successful.
- Avoid patterns that correlate with low engagement.

Output: Updated rewrite guidelines JSON with per-tone advice. Format:
{
  "guidelines": {
    "formal": { "advice": "...", "recommendations": ["..."] },
    "casual": { "advice": "...", "recommendations": ["..."] },
    "humorous": { "advice": "...", "recommendations": ["..."] },
    "assertive": { "advice": "...", "recommendations": ["..."] }
  },
  "version": 1,
  "updated_at": "${new Date().toISOString()}"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You optimize tone rewrite prompts for email outreach. Return valid JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const result = completion.choices[0]?.message?.content ?? "{}";
    return result;
  } catch (error) {
    console.error("Error tuning rewrite prompt:", error);
    throw error;
  }
}















