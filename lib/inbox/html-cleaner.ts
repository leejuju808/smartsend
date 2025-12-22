// Block 13300 — HTML Reply Cleaning Utility
// Cleans up HTML emails: removes signatures, quoted text, formats paragraphs

export function cleanHtmlEmail(html: string): {
  cleaned: string;
  hasQuotedText: boolean;
  signatureRemoved: boolean;
} {
  if (!html) {
    return { cleaned: "", hasQuotedText: false, signatureRemoved: false };
  }

  let cleaned = html;
  let hasQuotedText = false;
  let signatureRemoved = false;

  // Remove common email signatures
  const signaturePatterns = [
    /(?:\r?\n){2,}--\s*\r?\n.*$/s, // "-- " signature delimiter
    /(?:\r?\n){2,}Sent from.*$/is,
    /(?:\r?\n){2,}Best regards.*$/is,
    /(?:\r?\n){2,}Regards.*$/is,
    /(?:\r?\n){2,}Thanks.*$/is,
    /(?:\r?\n){2,}Sincerely.*$/is,
    /(?:\r?\n){2,}Sent from my iPhone.*$/is,
    /(?:\r?\n){2,}Sent from my Android.*$/is,
    /(?:\r?\n){2,}Get Outlook for.*$/is,
    /(?:\r?\n){2,}Get Gmail for.*$/is,
    /<div[^>]*class="[^"]*signature[^"]*"[^>]*>.*?<\/div>/gis,
    /<div[^>]*id="[^"]*signature[^"]*"[^>]*>.*?<\/div>/gis,
  ];

  for (const pattern of signaturePatterns) {
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, "");
      signatureRemoved = true;
    }
  }

  // Detect and optionally hide quoted text
  const quotedPatterns = [
    /<blockquote[^>]*>.*?<\/blockquote>/gis,
    /<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>.*?<\/div>/gis,
    /<div[^>]*class="[^"]*moz-cite-prefix[^"]*"[^>]*>.*?<\/div>/gis,
    /(?:\r?\n){2,}>.*$/s, // Lines starting with >
    /(?:\r?\n){2,}On .* wrote:.*$/s, // "On [date] [person] wrote:"
    /(?:\r?\n){2,}From:.*$/s,
    /(?:\r?\n){2,}Date:.*$/s,
    /(?:\r?\n){2,}Subject:.*$/s,
    /(?:\r?\n){2,}-----Original Message-----.*$/is,
    /(?:\r?\n){2,}________________________________.*$/is,
  ];

  // Extract quoted text before removing it
  let quotedText = "";
  for (const pattern of quotedPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      hasQuotedText = true;
      quotedText = match[0];
      // Remove quoted text from cleaned content
      cleaned = cleaned.replace(pattern, "");
    }
  }

  // Clean up HTML formatting
  // Remove excessive line breaks
  cleaned = cleaned.replace(/(\r?\n){3,}/g, "\n\n");
  
  // Convert <br> tags to proper line breaks
  cleaned = cleaned.replace(/<br\s*\/?>/gi, "\n");
  
  // Remove empty paragraphs
  cleaned = cleaned.replace(/<p[^>]*>\s*<\/p>/gi, "");
  
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, " ");
  cleaned = cleaned.replace(/\n\s+/g, "\n");
  cleaned = cleaned.replace(/\s+\n/g, "\n");

  // Remove script and style tags
  cleaned = cleaned.replace(/<script[^>]*>.*?<\/script>/gis, "");
  cleaned = cleaned.replace(/<style[^>]*>.*?<\/style>/gis, "");

  // Remove dangerous attributes
  cleaned = cleaned.replace(/on\w+="[^"]*"/gi, "");
  cleaned = cleaned.replace(/javascript:/gi, "");

  // Convert plain text line breaks to HTML
  if (!cleaned.includes("<")) {
    cleaned = cleaned.replace(/\n\n/g, "</p><p>");
    cleaned = `<p>${cleaned}</p>`;
  }

  return {
    cleaned: cleaned.trim(),
    hasQuotedText,
    signatureRemoved,
  };
}

export function extractQuotedText(html: string): string | null {
  const quotedPatterns = [
    /<blockquote[^>]*>(.*?)<\/blockquote>/gis,
    /<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>(.*?)<\/div>/gis,
    /(?:\r?\n){2,}(>.*)$/s,
    /(?:\r?\n){2,}(On .* wrote:.*)$/s,
  ];

  for (const pattern of quotedPatterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }

  return null;
}

