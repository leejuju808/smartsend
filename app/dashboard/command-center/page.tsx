import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import { OwnerCommandCenter } from "@/components/dashboard/OwnerCommandCenter";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Owner Command Center · SmartSend",
  description: "Your complete business visibility - money, leads, jobs, and safety in one screen",
};

export default async function CommandCenterPage() {
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
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Owner Command Center
          </h1>
          <p className="text-sm text-gray-400">
            Your complete business visibility — money, leads, jobs, and safety in real time
          </p>
        </div>
      </header>

      <OwnerCommandCenter />
    </div>
  );
}



























