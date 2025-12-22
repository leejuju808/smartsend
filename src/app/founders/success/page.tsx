"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function FoundersSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session_id");
  const [loading, setLoading] = useState(true);
  const [planName, setPlanName] = useState<string>("");

  useEffect(() => {
    // Verify subscription was created successfully
    if (sessionId) {
      // You could verify the session here if needed
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [sessionId]);

  const benefits = [
    "Priority support",
    "Early access to features",
    "Beta upgrades",
    "Founders pricing (early access)",
    "VIP access to new tools",
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {/* Success Icon */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-600 mb-6">
            <Check className="w-12 h-12 text-black" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="w-8 h-8 text-yellow-400" />
            <h1 className="text-4xl font-bold">Welcome to SmartSend Founders</h1>
          </div>
          <p className="text-xl text-gray-400">
            Your founders pricing is active.
          </p>
        </div>

        {/* Benefits Card */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-950 border-2 border-yellow-500 rounded-2xl p-8 mb-8">
          <h2 className="text-2xl font-semibold mb-6 text-center">
            Your account now has:
          </h2>
          <ul className="space-y-4">
            {benefits.map((benefit, idx) => (
              <li key={idx} className="flex items-start">
                <Check className="w-6 h-6 text-yellow-400 mr-3 flex-shrink-0 mt-0.5" />
                <span className="text-lg text-gray-300">{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Message */}
        <div className="bg-gradient-to-r from-yellow-900/50 to-yellow-800/50 border-2 border-yellow-500 rounded-2xl p-6 mb-8">
          <p className="text-center text-yellow-200 text-lg">
            You’re part of the early rollout for roofing companies. You have founders access and early features as they ship.
          </p>
        </div>

        {/* CTA Button */}
        <div className="text-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-yellow-500 text-black px-8 py-4 rounded-lg font-semibold text-lg hover:bg-yellow-400 transition-colors"
          >
            Go to Dashboard
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        {/* Additional Info */}
        <div className="mt-8 text-center text-gray-400 text-sm">
          <p>
            Need help getting started?{" "}
            <a href="mailto:support@smartsendhq.com" className="text-yellow-400 hover:text-yellow-300 underline">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
















































