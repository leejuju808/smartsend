// Block 24740 — SmartSend Roofing Ops Dashboard v1
// The Command Center for Roofing Companies

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import OpsDashboardClient from "./_components/OpsDashboardClient";

export const metadata: Metadata = {
  title: "Operations Dashboard · SmartSend",
  description: "The Command Center for Roofing Companies",
};

export default async function OpsDashboardPage() {
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
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Operations Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            The Command Center for Roofing Companies — See everything happening
            today at a glance.
          </p>
        </div>
      </header>

      <OpsDashboardClient workspaceId={workspaceId} />
    </div>
  );
}






































