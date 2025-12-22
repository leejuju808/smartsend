// Block 28060 — Homeowner Detail Page

import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import HomeownerDetail from "./_components/HomeownerDetail";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Homeowner Details · SmartSend",
};

export default async function HomeownerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    redirect("/welcome");
  }

  const { id } = await params;

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Homeowner Details
          </h1>
        </div>
        <a
          href="/dashboard/review-referral"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Review & Referral
        </a>
      </header>

      <HomeownerDetail homeownerId={id} workspaceId={workspaceId} />
    </div>
  );
}


































