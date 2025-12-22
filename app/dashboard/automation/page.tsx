// Block 75000 — Automation Dashboard Page
// /dashboard/automation

import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import AutomationDashboardClient from "./AutomationDashboardClient";

export default async function AutomationDashboardPage() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    redirect("/welcome");
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Automation Rules
          </h1>
          <p className="text-sm text-muted-foreground">
            Set up "IF this happens → THEN do that" automations to run your business 24/7.
          </p>
        </div>
      </header>

      <AutomationDashboardClient workspaceId={workspaceId} />
    </div>
  );
}



























