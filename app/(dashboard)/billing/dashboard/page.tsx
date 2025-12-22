// Block 240000 — SmartSend Roofing Billing & Payments Hub
// Internal Billing Dashboard

import { getServerSupabase } from "@/src/lib/supabase/server";
import { BillingDashboardClient } from "./components/BillingDashboardClient";

export default async function BillingDashboardPage() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <div>Unauthorized</div>;
  }

  // Get workspace_id from user context (you may need to adjust this based on your auth setup)
  const { data: workspace } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const workspaceId = workspace?.workspace_id;

  if (!workspaceId) {
    return <div>No workspace found</div>;
  }

  // Get dashboard metrics
  const { data: metrics } = await supabase.rpc("get_billing_dashboard_metrics", {
    p_workspace_id: workspaceId,
  });

  return <BillingDashboardClient workspaceId={workspaceId} initialMetrics={metrics} />;
}

























