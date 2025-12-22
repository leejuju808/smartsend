"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { X } from "lucide-react";
import { isCoachingUIEnabled } from "@/lib/feature-flags";

export function OnboardingBanner() {
  // BLOCK 272500 — Internalization Sprint: no coaching UI by default.
  if (!isCoachingUIEnabled()) return null;

  const router = useRouter();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const res = await fetch("/api/onboarding/step");
        if (res.ok) {
          const data = await res.json();
          if (!data.completed && data.step !== "complete") {
            setShow(true);
            setStep(data.step);
          }
        }
      } catch (error) {
        console.error("Error checking onboarding:", error);
      } finally {
        setLoading(false);
      }
    };

    checkOnboarding();
  }, []);

  if (loading || !show) return null;

  return (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4 relative">
      <button
        onClick={() => setShow(false)}
        className="absolute top-2 right-2 text-yellow-600 hover:text-yellow-800"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="pr-8">
        <p className="font-medium text-yellow-900 mb-2">
          Finish setting up SmartSend — you're almost there!
        </p>
        <p className="text-sm text-yellow-800 mb-3">
          Complete your onboarding to unlock all features and start sending campaigns.
        </p>
        <Button
          onClick={() => router.push("/onboarding")}
          className="bg-yellow-600 hover:bg-yellow-700 text-white"
          size="sm"
        >
          Continue Onboarding
        </Button>
      </div>
    </div>
  );
}












