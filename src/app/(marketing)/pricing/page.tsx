"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { CheckCircle2 } from "lucide-react";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="px-6 py-16 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Pricing That Grows With Your Business
        </h1>
        <p className="text-xl text-gray-600">
          Choose the plan that fits your roofing company. All plans include everything you need to run jobs and get paid.
        </p>
        <p className="text-sm text-gray-500 mt-3">
          One roof job usually pays for SmartSend for a year.
        </p>
      </section>

      {/* Pricing Cards */}
      <section className="px-6 py-12">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
          {/* Starter Plan */}
          <div className="border-2 border-gray-200 rounded-lg p-8 bg-white">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Starter</h2>
              <div className="text-5xl font-bold text-gray-900 mb-2">
                $99
                <span className="text-lg font-normal text-gray-600">/mo</span>
              </div>
              <p className="text-gray-600 text-sm mt-4">
                For: Small roofers who want jobs booked automatically.
              </p>
            </div>
            <ul className="space-y-3 mb-8">
              {[
                "1 campaign",
                "500 emails",
                "Basic AI",
                "Basic documents",
                "Basic payments",
                "1 automation",
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>
            <Link href="/signup" className="block">
              <Button size="lg" className="w-full bg-gray-900 text-white hover:bg-gray-800">
                Get Started
              </Button>
            </Link>
          </div>

          {/* Growth Plan */}
          <div className="border-2 border-gray-900 rounded-lg p-8 bg-white relative">
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
              <span className="bg-gray-900 text-white px-4 py-1 rounded-full text-sm font-semibold">
                Most Popular
              </span>
            </div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Growth</h2>
              <div className="text-5xl font-bold text-gray-900 mb-2">
                $199
                <span className="text-lg font-normal text-gray-600">/mo</span>
              </div>
              <p className="text-gray-600 text-sm mt-4">
                For: Roofers running 1+ crews and needing operations control.
              </p>
            </div>
            <ul className="space-y-3 mb-8">
              {[
                "3 campaigns",
                "2,000 emails",
                "Advanced AI",
                "Full scheduling",
                "Change orders",
                "Progress invoices",
                "6 automations",
                "Homeowner portal (full)",
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>
            <Link href="/signup" className="block">
              <Button size="lg" className="w-full bg-gray-900 text-white hover:bg-gray-800">
                Get Started
              </Button>
            </Link>
          </div>

          {/* Domination Plan */}
          <div className="border-2 border-gray-200 rounded-lg p-8 bg-white">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Domination</h2>
              <div className="text-5xl font-bold text-gray-900 mb-2">
                $399
                <span className="text-lg font-normal text-gray-600">/mo</span>
              </div>
              <p className="text-gray-600 text-sm mt-4">
                For: Companies that want SmartSend to run their entire workflow.
              </p>
            </div>
            <ul className="space-y-3 mb-8">
              {[
                "High-volume campaigns",
                "High-volume emails",
                "Full AI forecasting",
                "KPI engine",
                "Automation engine",
                "AI calendar",
                "Supplier intelligence",
                "VIP onboarding",
                "Field optimization",
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>
            <Link href="/signup" className="block">
              <Button size="lg" className="w-full bg-gray-900 text-white hover:bg-gray-800">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="px-6 py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            SmartSend replaces $2,000+ of tools for $99–$399/month.
          </h2>
          <p className="text-lg text-gray-700">
            No more juggling multiple systems. One platform. One price. Everything you need.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">
            Ready to get started?
          </h2>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/demo">
              <Button size="lg" className="bg-white text-gray-900 hover:bg-gray-100 px-8 py-4 text-lg">
                Get a Demo
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="lg" variant="outline" className="border-2 border-white text-white hover:bg-gray-800 px-8 py-4 text-lg">
                Sign Up Now
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
