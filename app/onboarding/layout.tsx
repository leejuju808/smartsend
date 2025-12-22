import { ReactNode } from "react";
import { OnboardingHeader } from "@/components/onboarding/header";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <OnboardingHeader />
      <main className="flex-1 flex items-stretch justify-center">
        {children}
      </main>
    </div>
  );
}










