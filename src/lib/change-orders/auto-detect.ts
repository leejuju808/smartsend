// Block 37990 — Auto-detect Scope Changes
// Detects potential change orders from photos, notes, and crew uploads

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Keywords that indicate potential change order issues
 */
const CHANGE_ORDER_KEYWORDS = [
  "rot",
  "rotten",
  "damaged decking",
  "soft spot",
  "extra layer",
  "additional layer",
  "bad flashing",
  "incorrect ventilation",
  "extra dump",
  "dump run",
  "extra labor",
  "unexpected repair",
  "upgrade",
  "hoa color",
  "color change",
  "discovered",
  "found",
  "issue",
  "problem",
  "damage",
  "needs replacement",
  "needs repair",
];

/**
 * Check if text contains change order keywords
 */
export function detectChangeOrderKeywords(text: string): {
  detected: boolean;
  keywords: string[];
  confidence: number;
} {
  const lowerText = text.toLowerCase();
  const foundKeywords: string[] = [];

  for (const keyword of CHANGE_ORDER_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      foundKeywords.push(keyword);
    }
  }

  const confidence = foundKeywords.length > 0 
    ? Math.min(0.5 + (foundKeywords.length * 0.15), 0.95)
    : 0;

  return {
    detected: foundKeywords.length > 0,
    keywords: foundKeywords,
    confidence,
  };
}

/**
 * Auto-detect change order from photo label
 */
export async function detectChangeOrderFromPhoto(
  jobId: string,
  photoUrl: string,
  label: string,
  caption?: string
): Promise<{ shouldCreate: boolean; reason?: string }> {
  // Check if label is "issue"
  if (label?.toLowerCase() === "issue") {
    return {
      shouldCreate: true,
      reason: "Photo labeled as 'issue'",
    };
  }

  // Check caption for keywords
  if (caption) {
    const detection = detectChangeOrderKeywords(caption);
    if (detection.detected) {
      return {
        shouldCreate: true,
        reason: `Keywords detected: ${detection.keywords.join(", ")}`,
      };
    }
  }

  return { shouldCreate: false };
}

/**
 * Auto-detect change order from crew notes
 */
export async function detectChangeOrderFromNotes(
  jobId: string,
  notes: string
): Promise<{ shouldCreate: boolean; reason?: string; issueText?: string }> {
  const detection = detectChangeOrderKeywords(notes);
  
  if (detection.detected) {
    return {
      shouldCreate: true,
      reason: `Change order keywords detected: ${detection.keywords.join(", ")}`,
      issueText: notes,
    };
  }

  return { shouldCreate: false };
}

/**
 * Auto-detect change order from homeowner inbox message
 */
export async function detectChangeOrderFromInbox(
  jobId: string,
  messageText: string
): Promise<{ shouldCreate: boolean; reason?: string; issueText?: string }> {
  // Check for upgrade requests, add-ons, etc.
  const upgradeKeywords = [
    "upgrade",
    "better",
    "add",
    "also need",
    "want to add",
    "can you also",
    "additional",
  ];

  const lowerText = messageText.toLowerCase();
  const hasUpgradeRequest = upgradeKeywords.some(keyword => 
    lowerText.includes(keyword)
  );

  if (hasUpgradeRequest) {
    return {
      shouldCreate: true,
      reason: "Homeowner requested upgrade/add-on",
      issueText: messageText,
    };
  }

  return { shouldCreate: false };
}

/**
 * Create change order automatically if detection threshold is met
 */
export async function autoCreateChangeOrder(
  jobId: string,
  issueText: string,
  photos?: Array<{ url: string; label?: string }>
): Promise<{ success: boolean; changeOrderId?: string; error?: string }> {
  try {
    // Call the generate API
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/change-orders/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: jobId,
          issue_text: issueText,
          photos: photos || [],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: error.error || "Failed to create change order",
      };
    }

    const data = await response.json();
    return {
      success: true,
      changeOrderId: data.change_order?.id,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to auto-create change order",
    };
  }
}
































