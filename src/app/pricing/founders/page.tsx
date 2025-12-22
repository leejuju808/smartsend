"use client";

import { useState, useEffect } from "react";
import { Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function FoundersPricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const isFounder = searchParams.get("founder") === "true";

  const handleCheckout = async (planId: "starter" | "growth" | "domination") => {
    setLoading(planId);
    try {
      const res = await fetch("/api/founders/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, founder: true }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Failed to create checkout: " + (data.error || "Unknown error"));
        setLoading(null);
      }
    } catch (error: any) {
      alert("Error: " + (error.message || "Failed to create checkout"));
      setLoading(null);
    }
  };

  const plans = [
    {
      id: "starter" as const,
      name: "Starter",
      price: "$99",
      period: "month",
      description: "Perfect for getting started",
      features: [
        "1 campaign",
        "500 emails/month",
        "Basic AI generation",
        "Dashboard access",
        "Email support",
      ],
      cta: "Get Starter",
      color: "border-gray-800",
    },
    {
      id: "growth" as const,
      name: "Growth",
      price: "$199",
      period: "month",
      description: "Most popular — for serious roofers",
      features: [
        "3 campaigns",
        "2,000 emails/month",
        "Enhanced AI generation",
        "Advanced dashboard",
        "Priority support",
        "Pipeline tracking",
      ],
      cta: "Get Growth",
      color: "border-yellow-500",
      popular: true,
    },
    {
      id: "domination" as const,
      name: "Domination",
      price: "$399",
      period: "month",
      description: "For owners who want real automation",
      features: [
        "High-volume campaigns",
        "High-volume emails",
        "Premium AI generation",
        "Full dashboard access",
        "Priority support",
        "Advanced automation",
        "Custom integrations",
      ],
      cta: "Get Domination",
      color: "border-purple-500",
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-6xl w-full">
        {/* Founders Deal Banner */}
        {isFounder && (
          <div className="text-center mb-8 p-6 bg-gradient-to-r from-yellow-900/50 to-yellow-800/50 border-2 border-yellow-500 rounded-2xl">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Sparkles className="w-6 h-6 text-yellow-400" />
              <h2 className="text-2xl font-bold text-yellow-400">
                Founders Rate Activated
              </h2>
            </div>
            <p className="text-lg text-yellow-200">
              Founders pricing activated
            </p>
            <p className="text-sm text-yellow-300/80 mt-2">
              Since you're part of the early rollout for roofing companies, you get founders access and early features as they ship.
            </p>
          </div>
        )}

        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4">
            SmartSend Founders Pricing
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Choose the plan that's right for your roofing business. 
            {isFounder && " Founders pricing is active."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-gradient-to-br from-gray-900 to-gray-950 p-8 rounded-2xl shadow-lg border-2 ${plan.color} ${
                plan.popular ? "ring-2 ring-yellow-500 ring-offset-4 ring-offset-black" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-yellow-500 text-black px-4 py-1 rounded-full text-sm font-semibold">
                    Most Popular
                  </span>
                </div>
              )}
              
              <div className="mb-6">
                <h2 className="text-2xl font-semibold mb-2">{plan.name}</h2>
                <div className="flex items-baseline">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.period && (
                    <span className="text-gray-400 ml-2">/{plan.period}</span>
                  )}
                </div>
                <p className="text-gray-400 mt-2 text-sm">{plan.description}</p>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start">
                    <Check className="w-5 h-5 text-yellow-400 mr-2 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCheckout(plan.id)}
                className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                  plan.popular
                    ? "bg-yellow-500 text-black hover:bg-yellow-400"
                    : "bg-gray-800 text-white hover:bg-gray-700"
                }`}
                disabled={loading === plan.id}
              >
                {loading === plan.id ? "Loading..." : plan.cta}
              </button>
            </div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-gray-400 text-sm mb-4">
            All plans include email templates, sequences, and reply tracking.
          </p>
          {isFounder && (
            <p className="text-yellow-400 text-sm font-semibold">
              ✨ Founders get priority support and early access to features
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
















































