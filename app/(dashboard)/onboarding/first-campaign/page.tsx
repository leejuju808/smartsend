"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export default function FirstCampaignOnboardingPage() {
  return <OnboardingWizard />;
}


