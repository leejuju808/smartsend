/**
 * AUREV OS SDK
 * Unified AI Operating System for SMBs
 * 
 * This SDK provides shared functionality across SmartSend, OpsGrid, and AgentCloud
 */

import { createSupabaseServer } from "../supabaseServer";
import { Stripe } from "stripe";

// =====================================================
// Types
// =====================================================

export interface AurevUser {
  id: string;
  user_id: string;
  org_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  modules_enabled: string[];
  preferences: AurevPreferences;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface AurevPreferences {
  theme: "light" | "dark";
  notifications: {
    email?: boolean;
    push?: boolean;
    slack?: boolean;
  };
  dashboard?: {
    widgets?: string[];
    layout?: string;
  };
}

export interface AurevModule {
  id: string;
  org_id: string;
  module: "smartsend" | "opsgrid" | "agentcloud";
  status: "active" | "inactive" | "suspended";
  usage: Record<string, any>;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface AurevAnalytics {
  module: string;
  date: string;
  events_count: number;
  revenue_usd: number;
  smartsend_sends?: number;
  smartsend_replies?: number;
  opsgrid_workflows_run?: number;
  opsgrid_tasks_completed?: number;
  agentcloud_messages_sent?: number;
  agentcloud_agents_deployed?: number;
  metrics: Record<string, any>;
}

export interface AurevEvent {
  event_type: string;
  module: "smartsend" | "opsgrid" | "agentcloud" | "core";
  payload: Record<string, any>;
  resource_type?: string;
  resource_id?: string;
  triggered_by?: string;
}

// =====================================================
// AUREV SDK Main Class
// =====================================================

export class AUREV {
  private supabase;

  constructor() {
    this.supabase = createSupabaseServer();
  }

  // =====================================================
  // Auth Module
  // =====================================================

  /**
   * Get current user's AUREV context
   */
  async getCurrentUser(): Promise<AurevUser | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await this.supabase
      .from("aurev_users")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error || !data) return null;
    return data as AurevUser;
  }

  /**
   * Get user's active organization
   */
  async getActiveOrg(): Promise<{ id: string; name: string } | null> {
    const user = await this.getCurrentUser();
    if (!user) return null;

    const { data, error } = await this.supabase
      .from("orgs")
      .select("id, name")
      .eq("id", user.org_id)
      .single();

    if (error || !data) return null;
    return data;
  }

  /**
   * Check if user has access to a specific module
   */
  async hasModuleAccess(module: "smartsend" | "opsgrid" | "agentcloud"): Promise<boolean> {
    const user = await this.getCurrentUser();
    if (!user) return false;
    
    return user.modules_enabled.includes(module);
  }

  /**
   * Update user preferences
   */
  async updatePreferences(preferences: Partial<AurevPreferences>): Promise<boolean> {
    const user = await this.getCurrentUser();
    if (!user) return false;

    const { error } = await this.supabase
      .from("aurev_users")
      .update({
        preferences: {
          ...user.preferences,
          ...preferences
        }
      })
      .eq("user_id", user.user_id);

    return !error;
  }

  // =====================================================
  // Billing Module
  // =====================================================

  /**
   * Upgrade to a new plan (unified billing)
   */
  async upgrade(plan: string, metadata?: Record<string, any>): Promise<{ success: boolean; url?: string }> {
    const org = await this.getActiveOrg();
    if (!org) return { success: false };

    // Get Stripe customer ID from org
    const { data: orgData } = await this.supabase
      .from("orgs")
      .select("stripe_customer_id")
      .eq("id", org.id)
      .single();

    if (!orgData?.stripe_customer_id) {
      // Create Stripe checkout session
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-12-18.acacia" });
      
      const session = await stripe.checkout.sessions.create({
        customer_email: (await this.supabase.auth.getUser()).data.user?.email,
        payment_method_types: ["card"],
        line_items: [
          {
            price: plan, // This should be a Stripe Price ID
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgrade=success`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgrade=cancel`,
        metadata: {
          org_id: org.id,
          ...metadata
        }
      });

      return { success: true, url: session.url || undefined };
    }

    return { success: false };
  }

  /**
   * Get billing status
   */
  async getBillingStatus(): Promise<{
    plan: string;
    status: string;
    current_period_end: number | null;
    cancel_at_period_end: boolean;
  } | null> {
    const org = await this.getActiveOrg();
    if (!org) return null;

    const { data } = await this.supabase
      .from("orgs")
      .select("stripe_subscription_id")
      .eq("id", org.id)
      .single();

    if (!data?.stripe_subscription_id) return null;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-12-18.acacia" });
    const subscription = await stripe.subscriptions.retrieve(data.stripe_subscription_id);

    return {
      plan: subscription.items.data[0]?.price.nickname || "unknown",
      status: subscription.status,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end || false
    };
  }

  // =====================================================
  // Analytics Module
  // =====================================================

  /**
   * Track an event across modules
   */
  async track(eventType: string, module: "smartsend" | "opsgrid" | "agentcloud" | "core", data?: Record<string, any>): Promise<boolean> {
    const user = await this.getCurrentUser();
    if (!user) return false;

    const { error } = await this.supabase.rpc("track_aurev_event", {
      p_org_id: user.org_id,
      p_event_type: eventType,
      p_module: module,
      p_payload: data || {},
      p_resource_type: null,
      p_resource_id: null
    });

    return !error;
  }

  /**
   * Get analytics for a specific module
   */
  async getAnalytics(
    module: "smartsend" | "opsgrid" | "agentcloud" | "combined",
    startDate?: Date,
    endDate?: Date
  ): Promise<AurevAnalytics[]> {
    const user = await this.getCurrentUser();
    if (!user) return [];

    let query = this.supabase
      .from("aurev_analytics")
      .select("*")
      .eq("org_id", user.org_id)
      .eq("module", module)
      .order("date", { ascending: false });

    if (startDate) {
      query = query.gte("date", startDate.toISOString().split("T")[0]);
    }
    if (endDate) {
      query = query.lte("date", endDate.toISOString().split("T")[0]);
    }

    const { data } = await query;
    return (data || []) as AurevAnalytics[];
  }

  /**
   * Get module usage stats
   */
  async getModuleUsage(): Promise<AurevModule[]> {
    const user = await this.getCurrentUser();
    if (!user) return [];

    const { data } = await this.supabase
      .from("aurev_modules")
      .select("*")
      .eq("org_id", user.org_id)
      .order("module");

    return (data || []) as AurevModule[];
  }

  /**
   * Get unified dashboard metrics
   */
  async getDashboardMetrics(): Promise<{
    total_revenue: number;
    total_events: number;
    smartsend_sends: number;
    smartsend_replies: number;
    opsgrid_workflows: number;
    opsgrid_tasks: number;
    agentcloud_messages: number;
    agentcloud_agents: number;
  }> {
    const user = await this.getCurrentUser();
    if (!user) return this.getEmptyMetrics();

    const { data } = await this.supabase
      .from("aurev_analytics")
      .select("*")
      .eq("org_id", user.org_id)
      .gte("date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

    if (!data || data.length === 0) return this.getEmptyMetrics();

    return {
      total_revenue: data.reduce((sum, d) => sum + Number(d.revenue_usd || 0), 0),
      total_events: data.reduce((sum, d) => sum + Number(d.events_count || 0), 0),
      smartsend_sends: data.reduce((sum, d) => sum + Number(d.smartsend_sends || 0), 0),
      smartsend_replies: data.reduce((sum, d) => sum + Number(d.smartsend_replies || 0), 0),
      opsgrid_workflows: data.reduce((sum, d) => sum + Number(d.opsgrid_workflows_run || 0), 0),
      opsgrid_tasks: data.reduce((sum, d) => sum + Number(d.opsgrid_tasks_completed || 0), 0),
      agentcloud_messages: data.reduce((sum, d) => sum + Number(d.agentcloud_messages_sent || 0), 0),
      agentcloud_agents: data.reduce((sum, d) => sum + Number(d.agentcloud_agents_deployed || 0), 0),
    };
  }

  private getEmptyMetrics() {
    return {
      total_revenue: 0,
      total_events: 0,
      smartsend_sends: 0,
      smartsend_replies: 0,
      opsgrid_workflows: 0,
      opsgrid_tasks: 0,
      agentcloud_messages: 0,
      agentcloud_agents: 0,
    };
  }
}

// =====================================================
// Singleton Instance
// =====================================================

let aurevInstance: AUREV | null = null;

export function getAUREV(): AUREV {
  if (!aurevInstance) {
    aurevInstance = new AUREV();
  }
  return aurevInstance;
}

// =====================================================
// Convenience Exports
// =====================================================

export const AUREVSDK = {
  auth: {
    getCurrentUser: () => getAUREV().getCurrentUser(),
    getActiveOrg: () => getAUREV().getActiveOrg(),
    hasModuleAccess: (module: "smartsend" | "opsgrid" | "agentcloud") => 
      getAUREV().hasModuleAccess(module),
    updatePreferences: (preferences: Partial<AurevPreferences>) => 
      getAUREV().updatePreferences(preferences),
  },
  billing: {
    upgrade: (plan: string, metadata?: Record<string, any>) => 
      getAUREV().upgrade(plan, metadata),
    getBillingStatus: () => getAUREV().getBillingStatus(),
  },
  analytics: {
    track: (eventType: string, module: "smartsend" | "opsgrid" | "agentcloud" | "core", data?: Record<string, any>) => 
      getAUREV().track(eventType, module, data),
    getAnalytics: (module: "smartsend" | "opsgrid" | "agentcloud" | "combined", startDate?: Date, endDate?: Date) => 
      getAUREV().getAnalytics(module, startDate, endDate),
    getModuleUsage: () => getAUREV().getModuleUsage(),
    getDashboardMetrics: () => getAUREV().getDashboardMetrics(),
  },
};

