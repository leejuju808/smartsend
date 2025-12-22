// Block 35333 — Revival Dashboard Page
// Main page for the Dead Lead Revival System

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { RevivalDashboard } from "@/components/revival/RevivalDashboard";
import { DeadLeadManager } from "@/components/revival/DeadLeadManager";

export default async function RevivalDashboardPage() {
  const supabase = await createClient();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get active workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", user.id)
    .single();

  const workspaceId = profile?.current_workspace_id;

  if (!workspaceId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          Please select a workspace to view the revival dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <RevivalDashboard workspaceId={workspaceId} />
      <DeadLeadManager workspaceId={workspaceId} />
    </div>
  );
}
































