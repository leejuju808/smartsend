// Block 85000 — SmartSend Roofing "Owner KPI Dashboard + Business Health Score Engine" v1
// Page: /kpi-dashboard
// The CEO dashboard — the place roofing owners go EVERY MORNING

import { getServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import KPIDashboardClient from "./KPIDashboardClient";

export const metadata = {
  title: "KPI Dashboard | SmartSend",
  description: "CEO-level intelligence for roofing companies",
};

export default async function KPIDashboardPage() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get workspace/company context
  const { data: workspaceMembers } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);

  const workspaceId = workspaceMembers?.[0]?.workspace_id;

  // Get company if exists
  const { data: companies } = await supabase
    .from("roofing_companies")
    .select("id, workspace_id, org_id")
    .eq("owner_id", user.id)
    .eq("is_active", true)
    .limit(1);

  const companyId = companies?.[0]?.id;
  const orgId = companies?.[0]?.org_id;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1920px] mx-auto">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Owner KPI Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Your morning snapshot — know exactly what to fix today
          </p>
        </div>
      </header>

      <KPIDashboardClient
        companyId={companyId}
        workspaceId={workspaceId}
        orgId={orgId}
      />
    </div>
  );
}



























