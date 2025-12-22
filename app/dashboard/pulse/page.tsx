import { Metadata } from "next";
import { DailyPulsePage } from "@/components/dashboard/DailyPulsePage";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export const metadata: Metadata = {
  title: "Daily Company Pulse · SmartSend",
  description: "Your morning command center - see what's going right, what needs attention, and where revenue is hiding",
};

export default async function PulsePage() {
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
    <div className="min-h-screen bg-background">
      <DailyPulsePage />
    </div>
  );
}









































