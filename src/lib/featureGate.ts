import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Feature definitions with required plan levels
const FEATURES: Record<string, ("solo"|"team"|"pro")> = {
  "send_queue": "solo",
  "smart_rewriter": "solo",
  "team_sharing": "team",
  "reply_inbox": "team",
  "ai_auto_detect": "team",
  "advanced_analytics": "pro",
  "custom_domains": "pro",
  "bulk_import": "team",
  "email_sequences": "team",
  "campaign_analytics": "solo",
  "unsubscribe_management": "solo",
  "email_tracking": "solo",
  "bounce_handling": "solo",
  "deliverability_monitoring": "pro",
  "api_access": "pro",
  "white_label": "pro",
};

// Plan hierarchy for comparison
const PLAN_RANK: Record<"solo"|"team"|"pro", number> = {
  solo: 1,
  team: 2,
  pro: 3
};

export interface FeatureGateResult {
  ok: boolean;
  reason?: "billing_inactive" | "upgrade_required" | "seats_exceeded";
  required?: "solo"|"team"|"pro";
  current_plan?: "solo"|"team"|"pro";
  seats_in_use?: number;
  seats_allowed?: number;
}

export async function checkFeature(
  workspace_id: string, 
  feature: keyof typeof FEATURES
): Promise<FeatureGateResult> {
  try {
    const { data } = await admin
      .from("billing_subscriptions")
      .select("plan, status, seats_allowed, seats_in_use")
      .eq("workspace_id", workspace_id)
      .maybeSingle();
    
    const plan = (data?.plan || "solo") as "solo"|"team"|"pro";
    const status = data?.status || "trialing";

    // Check billing status - lock if past_due/canceled except grace for 3 days
    const badStatuses = ["canceled", "unpaid", "incomplete"];
    if (badStatuses.includes(status)) {
      return { 
        ok: false, 
        reason: "billing_inactive",
        current_plan: plan,
        seats_in_use: data?.seats_in_use,
        seats_allowed: data?.seats_allowed
      };
    }

    // Check plan level
    const required = FEATURES[feature];
    if (PLAN_RANK[plan] < PLAN_RANK[required]) {
      return { 
        ok: false, 
        reason: "upgrade_required", 
        required,
        current_plan: plan,
        seats_in_use: data?.seats_in_use,
        seats_allowed: data?.seats_allowed
      };
    }

    // Check seat limits
    if (data && data.seats_in_use > data.seats_allowed) {
      return { 
        ok: false, 
        reason: "seats_exceeded",
        current_plan: plan,
        seats_in_use: data.seats_in_use,
        seats_allowed: data.seats_allowed
      };
    }

    return { 
      ok: true,
      current_plan: plan,
      seats_in_use: data?.seats_in_use,
      seats_allowed: data?.seats_allowed
    };
  } catch (error) {
    console.error("Feature gate error:", error);
    // Default to allowing access if there's an error (fail open)
    return { ok: true };
  }
}

// Helper function to check if workspace can add more members
export async function canAddMember(workspace_id: string): Promise<boolean> {
  try {
    const { data } = await admin
      .from("billing_subscriptions")
      .select("seats_allowed, seats_in_use")
      .eq("workspace_id", workspace_id)
      .maybeSingle();
    
    if (!data) return true; // No billing = no cap
    
    return data.seats_in_use < data.seats_allowed;
  } catch (error) {
    console.error("Can add member check error:", error);
    return true; // Fail open
  }
}

// Helper function to get workspace billing status
export async function getWorkspaceBillingStatus(workspace_id: string) {
  try {
    const { data } = await admin
      .from("billing_subscriptions")
      .select("plan, status, seats_allowed, seats_in_use, current_period_end")
      .eq("workspace_id", workspace_id)
      .maybeSingle();
    
    return {
      plan: data?.plan || "solo",
      status: data?.status || "trialing",
      seats_allowed: data?.seats_allowed || 1,
      seats_in_use: data?.seats_in_use || 0,
      current_period_end: data?.current_period_end,
      can_add_members: await canAddMember(workspace_id)
    };
  } catch (error) {
    console.error("Get billing status error:", error);
    return {
      plan: "solo",
      status: "trialing",
      seats_allowed: 1,
      seats_in_use: 0,
      can_add_members: true
    };
  }
}

// Middleware helper for API routes
export function createFeatureGateMiddleware(feature: keyof typeof FEATURES) {
  return async (workspace_id: string) => {
    const gate = await checkFeature(workspace_id, feature);
    if (!gate.ok) {
      throw new Error(JSON.stringify(gate));
    }
    return gate;
  };
}