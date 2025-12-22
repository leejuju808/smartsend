// Lightweight intent detector (no heavy NLP). Tunable keyword sets.
const KEYWORDS = [
  "call", "quick call", "hop on", "jump on", "zoom", "google meet", "teams",
  "meeting", "chat live", "schedule", "book time", "calendar", "phone",
  "availability", "time to connect", "let's talk", "phone call"
];

export function detectMeetingIntent(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  // Must have at least one keyword and some time-ish hint increases confidence
  const timeHints = ["today", "tomorrow", "this week", "next week", "morning", "afternoon", "pst", "est", "cst", "mst"];
  const hasKeyword = KEYWORDS.some(k => t.includes(k));
  const hasTimeHint = timeHints.some(k => t.includes(k));
  return hasKeyword || (hasKeyword && hasTimeHint);
} 