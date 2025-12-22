/**
 * Plan check utility for enforcing plan limits
 */

export async function requirePro(org_id: string) {
  const res = await fetch(
    `${process.env.SUPABASE_REST_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/org_billing?org_id=eq.${org_id}`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
    }
  ).then((r) => r.json());

  const plan = res?.[0]?.plan || "free";
  if (plan === "free") {
    throw new Error("Upgrade required");
  }
  return plan;
}

/**
 * Check if org has a paid plan (not free)
 */
export async function hasPaidPlan(org_id: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${process.env.SUPABASE_REST_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/org_billing?org_id=eq.${org_id}`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
      }
    ).then((r) => r.json());

    const plan = res?.[0]?.plan || "free";
    return plan !== "free";
  } catch (error) {
    console.error("Error checking plan:", error);
    return false;
  }
}

/**
 * Get org plan
 */
export async function getOrgPlan(org_id: string): Promise<string> {
  try {
    const res = await fetch(
      `${process.env.SUPABASE_REST_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/org_billing?org_id=eq.${org_id}`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
      }
    ).then((r) => r.json());

    return res?.[0]?.plan || "free";
  } catch (error) {
    console.error("Error getting plan:", error);
    return "free";
  }
}

