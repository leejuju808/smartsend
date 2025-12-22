import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Check if a domain is verified for sending emails
 * @param fromEmail - The sender email address
 * @returns Promise<boolean> - True if domain is verified, false otherwise
 */
export async function isDomainVerified(fromEmail: string): Promise<boolean> {
  try {
    // Extract domain from email address
    const domain = extractDomainFromEmail(fromEmail);
    if (!domain) return false;

    // Check if domain is verified in sender_domains table
    const { data, error } = await supabase
      .from("sender_domains")
      .select("verified")
      .eq("domain", domain.toLowerCase())
      .maybeSingle();

    if (error) {
      console.error("Error checking domain verification:", error);
      return false;
    }

    return !!data?.verified;
  } catch (error) {
    console.error("Error in domain verification check:", error);
    return false;
  }
}

/**
 * Extract domain from email address
 * @param email - Email address
 * @returns string | null - Domain or null if invalid
 */
function extractDomainFromEmail(email: string): string | null {
  try {
    // Handle email formats like "Name <email@domain.com>" or just "email@domain.com"
    const match = email.match(/@([^>]+)>?$/);
    if (match) {
      return match[1].toLowerCase();
    }
    
    // Fallback to simple @ split
    const parts = email.split("@");
    if (parts.length === 2) {
      return parts[1].toLowerCase();
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Get domain verification status with detailed information
 * @param fromEmail - The sender email address
 * @returns Promise<{verified: boolean, domain: string, lastCheck?: any} | null>
 */
export async function getDomainVerificationStatus(fromEmail: string) {
  try {
    const domain = extractDomainFromEmail(fromEmail);
    if (!domain) return null;

    const { data, error } = await supabase
      .from("sender_domains")
      .select("verified, domain, last_check, provider, dkim_selector, tracking_subdomain")
      .eq("domain", domain.toLowerCase())
      .maybeSingle();

    if (error) {
      console.error("Error getting domain verification status:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error getting domain verification status:", error);
    return null;
  }
}

/**
 * Check if multiple domains are verified
 * @param fromEmails - Array of sender email addresses
 * @returns Promise<{verified: string[], unverified: string[]}>
 */
export async function checkMultipleDomains(fromEmails: string[]) {
  const verified: string[] = [];
  const unverified: string[] = [];

  for (const email of fromEmails) {
    const isVerified = await isDomainVerified(email);
    if (isVerified) {
      verified.push(email);
    } else {
      unverified.push(email);
    }
  }

  return { verified, unverified };
} 