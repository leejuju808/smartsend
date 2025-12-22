// Block 28060 — SmartSend Roofing Review & Referral Engine v1
// Review & Referral Dashboard Page

import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import ReviewReferralDashboard from "./_components/ReviewReferralDashboard";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Review & Referral Engine · SmartSend",
  description: "Track reviews, referrals, and rewards for your roofing business",
};

export default async function ReviewReferralPage() {
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
          <h1 className="text-2xl font-semibold tracking-tight">
            Review & Referral Engine
          </h1>
          <p className="text-sm text-muted-foreground">
            Auto-request reviews, track referrals, and reward homeowners who bring you new business.
          </p>
        </div>
      </header>

      <ReviewReferralDashboard workspaceId={workspaceId} />
    </div>
  );
}


































