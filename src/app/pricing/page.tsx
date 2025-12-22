"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import Link from "next/link";

export default function PricingPage() {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async (plan: "free" | "pro" | "team") => {
    setLoading(true);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    setLoading(false);
  };

  const plans = [
    {
      name: "Free",
      price: "$0",
      period: "month",
      description: "Perfect for trying out SmartSend",
      features: [
        "50 emails per day",
        "10 AI generations",
        "Basic dashboard",
        "Limited AI generation",
        "Community support",
      ],
      cta: "Start Free",
      color: "border-gray-800",
      onCta: () => window.location.href = "/signup",
    },
    {
      name: "Pro ⚡",
      price: "$29",
      period: "month",
      description: "For individual users who want the full experience",
      features: [
        "500 emails per day",
        "200 AI generations",
        "Sequences included",
        "Team invites",
        "Advanced analytics",
        "Priority support",
      ],
      cta: "Get Pro",
      color: "border-yellow-500",
      popular: true,
      onCta: () => handleCheckout("pro"),
    },
    {
      name: "Team",
      price: "$99",
      period: "month",
      description: "For growing teams with advanced needs",
      features: [
        "5000 emails per day",
        "1000 AI generations",
        "Everything in Pro",
        "Priority support",
        "API access",
        "Custom integrations",
        "Dedicated account manager",
      ],
      cta: "Contact Sales",
      color: "border-gray-800",
      onCta: () => window.location.href = "mailto:sales@smartsendhq.com",
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-6xl w-full">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4">
            Pricing
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Choose the plan that's right for you. Start free, upgrade anytime.
          </p>
          <p className="text-sm text-gray-500 mt-3">
            One roof job usually pays for SmartSend for a year.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {plans.map((plan) => (
            <div
              key={plan.name}
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
                onClick={plan.onCta}
                className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                  plan.popular
                    ? "bg-yellow-500 text-black hover:bg-yellow-400"
                    : "bg-gray-800 text-white hover:bg-gray-700"
                }`}
                disabled={loading}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-gray-400 text-sm">
            All plans include email templates, sequences, and reply tracking.
            <br />
            Need enterprise pricing?{" "}
            <a
              href="mailto:sales@smartsendhq.com"
              className="text-yellow-400 hover:text-yellow-300 underline"
            >
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}