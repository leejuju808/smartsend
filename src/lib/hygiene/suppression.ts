import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Get a server Supabase client for suppression operations
 */
function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * Suppress an email address for a user
 * @param userId - The user ID (campaign owner)
 * @param email - The email address to suppress
 * @param reason - Reason for suppression: 'bounce', 'complaint', 'manual', 'seed', 'role'
 * @param source - Optional source: 'provider', 'gmail_webhook', 'import', etc.
 */
export async function suppressEmail(
  userId: string,
  email: string,
  reason: string,
  source?: string
) {
  const supabase = sb();
  const clean = email.trim().toLowerCase();
  const { error } = await supabase
    .from("suppressed_emails")
    .upsert(
      {
        user_id: userId,
        email: clean,
        reason,
        source: source || null,
      },
      { onConflict: "user_id,email" }
    );

  if (error) {
    throw new Error(`Failed to suppress email: ${error.message}`);
  }
}

/**
 * Suppress a domain for a user
 * @param userId - The user ID (campaign owner)
 * @param domain - The domain to suppress
 * @param reason - Reason for suppression: 'complaint_cluster', 'manual', 'seed', 'role'
 * @param source - Optional source identifier
 */
export async function suppressDomain(
  userId: string,
  domain: string,
  reason: string,
  source?: string
) {
  const supabase = sb();
  const d = domain.trim().toLowerCase();
  const { error } = await supabase
    .from("suppressed_domains")
    .upsert(
      {
        user_id: userId,
        domain: d,
        reason,
        source: source || null,
      },
      { onConflict: "user_id,domain" }
    );

  if (error) {
    throw new Error(`Failed to suppress domain: ${error.message}`);
  }
}

/**
 * Check if an email or its domain is suppressed
 * @param userId - The user ID (campaign owner)
 * @param email - The email address to check
 * @returns Object with email/domain suppression status and reason
 */
export async function isSuppressed(
  userId: string,
  email: string
): Promise<{ email: boolean; domain: boolean; reason?: string }> {
  const supabase = sb();
  const e = email.trim().toLowerCase();
  const domain = e.split("@")[1] ?? "";

  const [{ data: em }, { data: dm }] = await Promise.all([
    supabase
      .from("suppressed_emails")
      .select("reason")
      .eq("user_id", userId)
      .eq("email", e)
      .maybeSingle(),
    supabase
      .from("suppressed_domains")
      .select("reason")
      .eq("user_id", userId)
      .eq("domain", domain)
      .maybeSingle(),
  ]);

  return {
    email: !!em,
    domain: !!dm,
    reason: em?.reason ?? dm?.reason ?? undefined,
  };
}

/**
 * Remove an email from suppression (admin only)
 * @param userId - The user ID
 * @param email - The email to unsuppress
 */
export async function unsuppressEmail(userId: string, email: string) {
  const supabase = sb();
  const clean = email.trim().toLowerCase();
  const { error } = await supabase
    .from("suppressed_emails")
    .delete()
    .eq("user_id", userId)
    .eq("email", clean);

  if (error) {
    throw new Error(`Failed to unsuppress email: ${error.message}`);
  }
}

/**
 * Remove a domain from suppression (admin only)
 * @param userId - The user ID
 * @param domain - The domain to unsuppress
 */
export async function unsuppressDomain(userId: string, domain: string) {
  const supabase = sb();
  const d = domain.trim().toLowerCase();
  const { error } = await supabase
    .from("suppressed_domains")
    .delete()
    .eq("user_id", userId)
    .eq("domain", d);

  if (error) {
    throw new Error(`Failed to unsuppress domain: ${error.message}`);
  }
}

