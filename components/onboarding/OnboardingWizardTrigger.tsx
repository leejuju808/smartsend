"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { OnboardingWizard } from "./OnboardingWizard";

export function OnboardingWizardTrigger() {
  const router = useRouter();
  const pathname = usePathname();
  const [showWizard, setShowWizard] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkOnboardingStatus();
  }, [pathname]);

  const checkOnboardingStatus = async () => {
    // Don't show wizard on onboarding pages or auth pages
    if (
      pathname?.includes("/onboarding") ||
      pathname?.includes("/login") ||
      pathname?.includes("/signup")
    ) {
      setChecking(false);
      return;
    }

    try {
      const res = await fetch("/api/onboarding/state");
      if (!res.ok) {
        setChecking(false);
        return;
      }

      const data = await res.json();

      // Show wizard if:
      // 1. User hasn't completed onboarding
      // 2. They're on the dashboard or campaigns page
      // 3. They don't have any campaigns yet
      if (!data.completed && (pathname === "/dashboard" || pathname === "/campaigns")) {
        // Check if they have campaigns
        const campaignsRes = await fetch("/api/campaigns?limit=1");
        if (campaignsRes.ok) {
          const campaignsData = await campaignsRes.json();
          const hasCampaigns = campaignsData.campaigns?.length > 0;

          if (!hasCampaigns) {
            setShowWizard(true);
          }
        } else {
          // If we can't check campaigns, show wizard anyway for new users
          setShowWizard(true);
        }
      }
    } catch (error) {
      console.error("Error checking onboarding status:", error);
    } finally {
      setChecking(false);
    }
  };

  if (checking || !showWizard) {
    return null;
  }

  return <OnboardingWizard />;
}




























































