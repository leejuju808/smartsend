// Block 21675 — Step 2: Connect Email
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ConnectEmailStep from "@/components/onboarding/ConnectEmailStep";

export default function ConnectEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check if user just connected email
    const connected = searchParams.get("connected");
    if (connected === "true") {
      // Update onboarding step and move to next
      async function moveToNext() {
        try {
          await fetch("/api/onboarding/state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ current_step: "add-leads" }),
          });
          router.push("/onboarding/add-leads");
        } catch (error) {
          console.error("Error updating onboarding step:", error);
        }
      }
      moveToNext();
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <ConnectEmailStep />
      </div>
    </div>
  );
}
