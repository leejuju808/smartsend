import { createClient } from "@/lib/supabase/server";

export type SendGuardResult = {
  canSend: boolean;
  reason: string | null;
  status: string | null;
  planId: string | null;
};

export async function assertWorkspaceCanSend(
  workspaceId: string
): Promise<SendGuardResult> {
  const supabase = createClient();

  const { data: state, error: stateErr } = await supabase
    .from("workspace_billing_state")
    .select(
      "plan_id, subscription_status"
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (stateErr) {
    console.error("[billing.canSend] state error", stateErr);
    return {
      canSend: false,
      reason: "billing_state_error",
      status: null,
      planId: null,
    };
  }

  const planId = state?.plan_id || null;
  const status = state?.subscription_status || null;

  // same logic as /api/billing/status
  if (!planId) {
    return {
      canSend: false,
      reason: "no_plan",
      status,
      planId,
    };
  }

  if (!status) {
    if (planId === "free") {
      return {
        canSend: true,
        reason: null,
        status,
        planId,
      };
    }
    return {
      canSend: false,
      reason: "no_subscription",
      status,
      planId,
    };
  }

  if (status === "past_due" || status === "unpaid") {
    return {
      canSend: false,
      reason: "payment_issue",
      status,
      planId,
    };
  }

  if (status === "canceled" || status === "incomplete_expired") {
    if (planId === "free") {
      return {
        canSend: true,
        reason: null,
        status,
        planId,
      };
    }
    return {
      canSend: false,
      reason: "subscription_canceled",
      status,
      planId,
    };
  }

  return {
    canSend: true,
    reason: null,
    status,
    planId,
  };
}





