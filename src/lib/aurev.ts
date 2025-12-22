import { AUREVCore } from "@aurev/core-sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * AUREV Core SDK Instance for Server-Side Usage
 * 
 * This provides unified access to:
 * - Auth (shared login + org context)
 * - Billing (Stripe unified plans)
 * - Analytics (central telemetry)
 * - App switching & API access
 * 
 * Usage example:
 * 
 * ```ts
 * const aurev = createAurevServer();
 * const user = await aurev.getUser();
 * const org = await aurev.getOrg();
 * const plan = await aurev.getPlan();
 * await aurev.track("campaign_sent", { org, plan });
 * ```
 * 
 * This function creates an SDK instance with proper SSR cookie handling
 * for authentication.
 */
export function createAurevServer() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );

  // Pass the SSR client to the SDK for proper authentication
  return new AUREVCore({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    stripeKey: process.env.STRIPE_SECRET_KEY!,
    supabaseClient: supabase,
  });
}

/**
 * Default server-side instance (for convenience)
 * Note: Use createAurevServer() in API routes for better cookie handling
 */
export const aurev = createAurevServer();


