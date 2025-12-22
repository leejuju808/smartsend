/**
 * Utilities for validating and working with merge tags
 */

const MERGE_TAG_RE = /\{\{\s*[\w\.]+\s*\}\}/g;
// Support multiple merge tag formats: {tag}, {{tag}}, [[tag]], <%tag%>
const MULTI_FORMAT_TAG_RE = /(\{\{\s*[\w\.]+\s*\}\}|\{\s*[\w\.]+\s*\}|\[\[\s*[\w\.]+\s*\]\]|<%\s*[\w\.]+\s*%>)/g;

/**
 * Extract all merge tags from a string
 */
export function extractMergeTags(s: string): string[] {
  return Array.from(s.matchAll(MERGE_TAG_RE)).map(m => m[0]);
}

/**
 * Validate that all merge tags from original exist in rewritten text
 */
export function validateMergeTagsPreserved(originalBody: string, rewrittenBody: string): {
  valid: boolean;
  missing: string[];
} {
  const originalTags = extractMergeTags(originalBody);
  const rewrittenTags = extractMergeTags(rewrittenBody);
  
  const missing = originalTags.filter(tag => !rewrittenTags.includes(tag));
  
  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Check for deliverability issues in subject/body
 */
export function checkDeliverability(subject: string, body: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Check subject for spam triggers
  const spamWords = ["FREE!!!", "risk-free", "guaranteed", "act now"];
  const subjectUpper = subject.toUpperCase();
  
  // Check for excessive punctuation in subject
  const exclamationCount = (subject.match(/!/g) || []).length;
  if (exclamationCount > 1) {
    issues.push("Subject has more than one exclamation mark");
  }
  
  // Check for ALL CAPS
  if (subject === subject.toUpperCase() && subject.length > 5) {
    issues.push("Subject is in all caps");
  }
  
  // Check for spam trigger words
  for (const word of spamWords) {
    if (subjectUpper.includes(word)) {
      issues.push(`Subject contains spam trigger: "${word}"`);
      break;
    }
  }
  
  // Check body for excessive punctuation
  const bodyExclamationCount = (body.match(/!!+/g) || []).length;
  if (bodyExclamationCount > 0) {
    issues.push("Body contains excessive exclamation marks");
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Validate that no unrendered merge tags exist in the final email content
 * This is a safety check before sending to catch bad edits
 */
export function validateNoUnrenderedTags(text: string, html?: string): {
  valid: boolean;
  unrendered: string[];
} {
  const combined = text + " " + (html || "");
  const matches = combined.match(MULTI_FORMAT_TAG_RE) || [];
  const unrendered = Array.from(new Set(matches)); // dedupe
  
  return {
    valid: unrendered.length === 0,
    unrendered
  };
}

