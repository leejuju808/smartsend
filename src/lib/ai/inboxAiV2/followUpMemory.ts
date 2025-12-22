/**
 * Block 24180 — SmartSend Roofing Inbox AI v2
 * Follow-Up Memory System
 * 
 * Extracts follow-up commitments from homeowner messages and creates reminders:
 * - "Later this week" → reminder for this week
 * - "Next month" → reminder for next month
 * - "Check back after insurance adjuster" → reminder after estimated date
 */

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface FollowUpCommitment {
  triggerText: string; // What the homeowner said
  scheduledFor: Date;
  taskType: "follow_up" | "reminder" | "queued_message" | "check_back";
  queuedSubject?: string;
  queuedBody?: string;
}

/**
 * Extracts follow-up commitments from homeowner message
 */
export async function extractFollowUpCommitments(
  messageText: string,
  subject?: string | null
): Promise<FollowUpCommitment[]> {
  const fullText = [subject, messageText].filter(Boolean).join("\n\n");
  const trimmed = fullText.trim().slice(0, 2000);

  if (!trimmed) {
    return [];
  }

  // Rule-based extraction for common patterns
  const lowerText = trimmed.toLowerCase();
  const commitments: FollowUpCommitment[] = [];
  const now = new Date();

  // Pattern: "later this week"
  if (/\b(?:later this week|this week|end of week)\b/i.test(lowerText)) {
    const scheduledFor = new Date(now);
    scheduledFor.setDate(scheduledFor.getDate() + 3); // 3 days from now
    scheduledFor.setHours(10, 0, 0, 0); // 10 AM
    
    commitments.push({
      triggerText: extractTriggerText(lowerText, /\b(?:later this week|this week|end of week)\b/i),
      scheduledFor,
      taskType: "check_back"
    });
  }

  // Pattern: "next week"
  if (/\b(?:next week|following week)\b/i.test(lowerText)) {
    const scheduledFor = new Date(now);
    scheduledFor.setDate(scheduledFor.getDate() + 7);
    scheduledFor.setHours(10, 0, 0, 0);
    
    commitments.push({
      triggerText: extractTriggerText(lowerText, /\b(?:next week|following week)\b/i),
      scheduledFor,
      taskType: "check_back"
    });
  }

  // Pattern: "next month"
  if (/\b(?:next month|following month)\b/i.test(lowerText)) {
    const scheduledFor = new Date(now);
    scheduledFor.setMonth(scheduledFor.getMonth() + 1);
    scheduledFor.setHours(10, 0, 0, 0);
    
    commitments.push({
      triggerText: extractTriggerText(lowerText, /\b(?:next month|following month)\b/i),
      scheduledFor,
      taskType: "check_back"
    });
  }

  // Pattern: "after [event]" (e.g., "after insurance adjuster", "after storm")
  const afterPattern = /\bafter\s+(?:the\s+)?(?:insurance\s+adjuster|adjuster|storm|hail|inspection|claim)\b/i;
  if (afterPattern.test(lowerText)) {
    const scheduledFor = new Date(now);
    scheduledFor.setDate(scheduledFor.getDate() + 14); // 2 weeks default
    scheduledFor.setHours(10, 0, 0, 0);
    
    commitments.push({
      triggerText: extractTriggerText(lowerText, afterPattern),
      scheduledFor,
      taskType: "follow_up"
    });
  }

  // Pattern: "in [X] days/weeks"
  const timePattern = /\bin\s+(\d+)\s+(?:day|days|week|weeks|month|months)\b/i;
  const timeMatch = lowerText.match(timePattern);
  if (timeMatch) {
    const amount = parseInt(timeMatch[1]);
    const unit = timeMatch[0].includes("day") ? "days" : 
                 timeMatch[0].includes("week") ? "weeks" : "months";
    
    const scheduledFor = new Date(now);
    if (unit === "days") {
      scheduledFor.setDate(scheduledFor.getDate() + amount);
    } else if (unit === "weeks") {
      scheduledFor.setDate(scheduledFor.getDate() + (amount * 7));
    } else {
      scheduledFor.setMonth(scheduledFor.getMonth() + amount);
    }
    scheduledFor.setHours(10, 0, 0, 0);
    
    commitments.push({
      triggerText: extractTriggerText(lowerText, timePattern),
      scheduledFor,
      taskType: "check_back"
    });
  }

  // Use AI to extract more complex commitments
  try {
    const aiCommitments = await extractCommitmentsWithAI(trimmed);
    commitments.push(...aiCommitments);
  } catch (error) {
    console.error("Error extracting commitments with AI:", error);
  }

  // Deduplicate and return
  return deduplicateCommitments(commitments);
}

/**
 * Extracts trigger text from message
 */
function extractTriggerText(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  if (match) {
    const start = Math.max(0, match.index! - 20);
    const end = Math.min(text.length, match.index! + match[0].length + 20);
    return text.slice(start, end).trim();
  }
  return text.slice(0, 100);
}

/**
 * Uses AI to extract complex follow-up commitments
 */
async function extractCommitmentsWithAI(messageText: string): Promise<FollowUpCommitment[]> {
  const systemPrompt = `You are extracting follow-up commitments from homeowner messages for a roofing company.

Look for phrases that indicate the homeowner wants to be contacted later:
- "Check back next week"
- "After the insurance adjuster comes"
- "Maybe next month"
- "Let me think about it and get back to you"
- "I'll let you know after [event]"

Return JSON array of commitments:
[
  {
    "triggerText": "exact phrase from message",
    "scheduledFor": "ISO date string",
    "taskType": "follow_up|reminder|check_back"
  }
]

If no commitments found, return empty array [].`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extract follow-up commitments from:\n\n${messageText}` }
      ],
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content);
    const commitments = Array.isArray(parsed.commitments) ? parsed.commitments : 
                       Array.isArray(parsed) ? parsed : [];

    return commitments.map((c: any) => ({
      triggerText: c.triggerText || "",
      scheduledFor: new Date(c.scheduledFor || new Date().toISOString()),
      taskType: c.taskType || "check_back",
      queuedSubject: c.queuedSubject,
      queuedBody: c.queuedBody
    })).filter((c: FollowUpCommitment) => c.scheduledFor > new Date());

  } catch (error) {
    console.error("Error extracting commitments with AI:", error);
    return [];
  }
}

/**
 * Deduplicates commitments
 */
function deduplicateCommitments(commitments: FollowUpCommitment[]): FollowUpCommitment[] {
  const seen = new Set<string>();
  return commitments.filter(c => {
    const key = `${c.scheduledFor.toISOString()}-${c.triggerText.slice(0, 50)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}






































