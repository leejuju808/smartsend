// Block 254300 — SmartSend Sales Acceleration Engine v1
// Sales Dashboard Page

import { getServerSupabase } from "@/lib/supabase/server";
import { SalesPipelineDashboard } from "@/components/sales/SalesPipelineDashboard";
import { SalesRepPerformance } from "@/components/sales/SalesRepPerformance";
import ApprovedCaseStudiesSidebar from "./ApprovedCaseStudiesSidebar";
import { redirect } from "next/navigation";

export default async function SalesDashboardPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user's org
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  const orgId = membership?.org_id;

  if (!orgId) {
    return (
      <div className="p-6">
        <p>No organization found. Please create or join an organization.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <SalesPipelineDashboard orgId={orgId} />
          <SalesRepPerformance orgId={orgId} days={30} />
        </div>
        <ApprovedCaseStudiesSidebar />
      </div>
    </div>
  );
}






















