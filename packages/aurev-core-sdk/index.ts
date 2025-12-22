import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export interface AUREVCoreOptions {
  supabaseUrl: string;
  supabaseKey: string;
  stripeKey: string;
  supabaseClient?: SupabaseClient; // Optional: provide your own Supabase client (e.g., with SSR cookie handling)
}

export class AUREVCore {
  supabase: SupabaseClient;
  stripe: Stripe;
  org_id?: string;

  constructor(opts: AUREVCoreOptions) {
    // Use provided client or create a new one
    this.supabase = opts.supabaseClient || createClient(opts.supabaseUrl, opts.supabaseKey);
    this.stripe = new Stripe(opts.stripeKey, { apiVersion: "2024-06-20" });
  }

  // Auth
  async getUser() {
    const { data: { user } } = await this.supabase.auth.getUser();
    return user;
  }

  async getOrg() {
    const user = await this.getUser();
    if (!user) {
      throw new Error("User not authenticated");
    }

    // First try to get org_id from aurev_users mapping table
    const { data: mapping } = await this.supabase
      .from("aurev_users")
      .select("org_id")
      .eq("user_id", user.id)
      .single();

    if (mapping?.org_id) {
      this.org_id = mapping.org_id;
      return mapping.org_id;
    }

    // Fallback: get user's first organization from organization_members
    const { data: orgMember } = await this.supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (orgMember?.org_id) {
      this.org_id = orgMember.org_id;
      return orgMember.org_id;
    }

    return null;
  }

  // Billing
  async getPlan() {
    if (!this.org_id) {
      await this.getOrg();
    }

    const user = await this.getUser();
    if (!user) {
      return "free";
    }

    // Try org-based subscription first (preferred for unified billing)
    if (this.org_id) {
      const { data: orgSub } = await this.supabase
        .from("subscriptions")
        .select("plan")
        .eq("org_id", this.org_id)
        .single();

      if (orgSub?.plan) {
        return orgSub.plan;
      }
    }

    // Fallback to user-based subscription (backwards compatibility)
    const { data: userSub } = await this.supabase
      .from("subscriptions")
      .select("plan")
      .eq("user_id", user.id)
      .single();

    return userSub?.plan || "free";
  }

  async upgradePlan(plan: string) {
    if (!this.org_id) {
      await this.getOrg();
    }

    if (!this.org_id) {
      throw new Error("Organization not found");
    }

    // Get Stripe price ID based on plan
    const priceId = plan === "pro" 
      ? process.env.STRIPE_PRICE_PRO 
      : process.env.STRIPE_PRICE_ENTERPRISE;

    if (!priceId) {
      throw new Error(`Stripe price ID not configured for plan: ${plan}`);
    }

    const dashUrl = process.env.AUREV_DASH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${dashUrl}/billing/success`,
      cancel_url: `${dashUrl}/billing`,
      metadata: {
        org_id: this.org_id,
        plan: plan,
      },
    });

    return session.url;
  }

  // Analytics
  async track(event: string, data: any = {}) {
    if (!this.org_id) {
      await this.getOrg();
    }

    const user = await this.getUser();

    return await this.supabase.from("analytics_events").insert({
      org_id: this.org_id || null,
      event,
      payload: data,
      user_id: user?.id || null,
    });
  }
}

