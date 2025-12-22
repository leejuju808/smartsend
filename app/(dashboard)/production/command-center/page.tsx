// Block 246000 — Production Command Center v1
// The Master Control Room for Roofing Operations

import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import { redirect } from "next/navigation";
import { ProductionCommandCenterClient } from "./components/ProductionCommandCenterClient";

export default async function ProductionCommandCenterPage() {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    redirect("/welcome");
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <ProductionCommandCenterClient workspaceId={workspaceId} />
    </div>
  );
}

























