/**
 * Block 260: Bulk Importer v3 - Smart Error Repair Suggestions
 * Generates repair suggestions for common import errors
 */

export interface RepairSuggestion {
  field: string;
  type: string;
  proposed_value: string;
  original_value: string;
}

export type SuggestionType =
  | "trim_whitespace"
  | "lowercase"
  | "trim_and_lowercase"
  | "strip_protocol"
  | "append_default_user"
  | "normalize_phone"
  | "fix_domain_format";

/**
 * Generate repair suggestion for an email error
 */
export function suggestEmailRepair(
  email: string,
  field: string = "email"
): RepairSuggestion | null {
  if (!email || typeof email !== "string") return null;

  const trimmed = email.trim();
  const lowercased = trimmed.toLowerCase();
  const hasWhitespace = email !== trimmed;
  const hasUppercase = email.toLowerCase() !== email;

  // Check if it's a domain-only value (e.g., "acme.com")
  const domainOnlyPattern = /^[\da-z\.-]+\.[a-z]{2,}$/i;
  if (domainOnlyPattern.test(trimmed) && !trimmed.includes("@")) {
    return {
      field,
      type: "append_default_user",
      proposed_value: `info@${trimmed}`,
      original_value: email,
    };
  }

  // Check if it has protocol (http:// or https://)
  if (/^https?:\/\//i.test(trimmed)) {
    const domain = trimmed.replace(/^https?:\/\//i, "").split("/")[0];
    if (domainOnlyPattern.test(domain)) {
      return {
        field,
        type: "strip_protocol",
        proposed_value: domain,
        original_value: email,
      };
    }
  }

  // Trim whitespace and lowercase
  if (hasWhitespace || hasUppercase) {
    return {
      field,
      type: hasWhitespace && hasUppercase ? "trim_and_lowercase" : hasWhitespace ? "trim_whitespace" : "lowercase",
      proposed_value: lowercased,
      original_value: email,
    };
  }

  return null;
}

/**
 * Generate repair suggestion for a website/domain error
 */
export function suggestWebsiteRepair(
  website: string,
  field: string = "website"
): RepairSuggestion | null {
  if (!website || typeof website !== "string") return null;

  const trimmed = website.trim();

  // Strip protocol if present
  if (/^https?:\/\//i.test(trimmed)) {
    const domain = trimmed.replace(/^https?:\/\//i, "").split("/")[0];
    return {
      field,
      type: "strip_protocol",
      proposed_value: domain,
      original_value: website,
    };
  }

  // Trim whitespace
  if (website !== trimmed) {
    return {
      field,
      type: "trim_whitespace",
      proposed_value: trimmed,
      original_value: website,
    };
  }

  return null;
}

/**
 * Generate repair suggestion for a phone error
 */
export function suggestPhoneRepair(
  phone: string,
  field: string = "phone"
): RepairSuggestion | null {
  if (!phone || typeof phone !== "string") return null;

  const trimmed = phone.trim();
  if (phone !== trimmed) {
    return {
      field,
      type: "trim_whitespace",
      proposed_value: trimmed,
      original_value: phone,
    };
  }

  return null;
}

/**
 * Generate repair suggestion for any field based on error message
 */
export function suggestRepair(
  field: string,
  value: any,
  errorMessage: string
): RepairSuggestion | null {
  if (!value || typeof value !== "string") return null;

  const lowerError = errorMessage.toLowerCase();

  if (field === "email" || lowerError.includes("email")) {
    return suggestEmailRepair(value, field);
  }

  if (field === "website" || field === "domain" || lowerError.includes("domain") || lowerError.includes("website")) {
    return suggestWebsiteRepair(value, field);
  }

  if (field === "phone" || lowerError.includes("phone")) {
    return suggestPhoneRepair(value, field);
  }

  // Generic whitespace trimming
  if (lowerError.includes("whitespace") || lowerError.includes("trim")) {
    const trimmed = String(value).trim();
    if (value !== trimmed) {
      return {
        field,
        type: "trim_whitespace",
        proposed_value: trimmed,
        original_value: value,
      };
    }
  }

  return null;
}









