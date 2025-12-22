// Block 21675 — Connect Email Step Component
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ConnectEmailStep() {
  const router = useRouter();
  const [isConnecting, setIsConnecting] = useState(false);

  async function connect(provider: "google" | "outlook") {
    setIsConnecting(true);
    try {
      // Redirect to OAuth flow with return URL
      const returnUrl = encodeURIComponent("/onboarding/connect-email?connected=true");
      if (provider === "google") {
        window.location.href = `/api/auth/google/start?return_url=${returnUrl}`;
      } else {
        window.location.href = `/api/auth/microsoft/start?return_url=${returnUrl}`;
      }
    } catch (error) {
      console.error("Error connecting email:", error);
      setIsConnecting(false);
    }
  }

  async function skip() {
    try {
      await fetch("/api/onboarding/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_step: "add-leads" }),
      });
      router.push("/onboarding/add-leads");
    } catch (error) {
      console.error("Error updating onboarding step:", error);
      router.push("/onboarding/add-leads");
    }
  }

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Connect Your Email
        </h1>
        <p className="text-sm text-gray-600">
          SmartSend will send your roofing emails directly from your email account.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <button
          disabled={isConnecting}
          className="px-6 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          onClick={() => connect("google")}
        >
          {isConnecting ? "Connecting..." : "Continue with Gmail"}
        </button>

        <button
          disabled={isConnecting}
          className="px-6 py-3 bg-blue-700 text-white rounded-md hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          onClick={() => connect("outlook")}
        >
          {isConnecting ? "Connecting..." : "Continue with Outlook"}
        </button>
      </div>

      <button
        onClick={skip}
        className="text-sm text-gray-600 underline hover:text-gray-800"
      >
        Skip for now
      </button>
    </div>
  );
}

