// Block 61000 — SmartSend Roofing "AI Profit Maximizer + Pricing Optimization Engine" v1
// Profit Dashboard Page

import { getServerSupabase } from "@/lib/supabase/server";
import { getCurrentTeamId } from "@/lib/team-helpers";
import { ProfitDashboard } from "@/components/profit/ProfitDashboard";
import { redirect } from "next/navigation";

export default async function ProfitDashboardPage() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const teamId = await getCurrentTeamId();
  if (!teamId) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <ProfitDashboard teamId={teamId} />
    </div>
  );
}





























