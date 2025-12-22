"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export default function HomePageClient() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="px-6 py-24 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
          Run Your Entire Roofing Company With AI — From Leads to Final Payment.
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Book jobs, run jobs, and get paid automatically. Built ONLY for roofing companies.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/demo">
            <Button size="lg" className="bg-gray-900 text-white hover:bg-gray-800 px-8 py-4 text-lg">
              Get a Demo
            </Button>
          </Link>
          <Link href="/pricing">
            <Button size="lg" variant="outline" className="border-2 border-gray-900 text-gray-900 hover:bg-gray-50 px-8 py-4 text-lg">
              See Pricing
            </Button>
          </Link>
        </div>
      </section>

      {/* Logos Section */}
      <section className="px-6 py-12 bg-gray-50 border-y">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center justify-items-center text-gray-600">
            <div className="text-center">
              <div className="font-semibold text-sm">Built with AI</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-sm">Stripe Payments</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-sm">Supabase Infrastructure</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-sm">Roofing Industry Focused</div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="px-6 py-20 max-w-4xl mx-auto">
        <h2 className="text-4xl font-bold text-gray-900 mb-8 text-center">
          Roofing businesses fail because the office is chaos.
        </h2>
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {[
            "Missed follow-ups",
            "Messy scheduling",
            "Homeowner confusion",
            "Lost documents",
            "Delayed payments",
            "No visibility",
            "Margin leaks everywhere",
            "Too many tools that don't talk",
            "Owners doing everything themselves",
          ].map((problem, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="text-red-500 mt-1">•</div>
              <p className="text-gray-700">{problem}</p>
            </div>
          ))}
        </div>
        <p className="text-2xl font-semibold text-gray-900 text-center mt-12">
          SmartSend fixes all of it — automatically.
        </p>
      </section>

      {/* Solution Section */}
      <section className="px-6 py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-3xl font-bold text-gray-900 mb-4">
            SmartSend = The Roofing Operating System.
          </div>
          <div className="text-xl text-gray-700 space-y-2">
            <p>AI built into every job.</p>
            <p>Automation built into every process.</p>
          </div>
        </div>
      </section>

      {/* Feature Pillars */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "AI Lead Engine",
                description: "Get roofing jobs on autopilot without buying ads.",
              },
              {
                title: "Scheduling & Production",
                description: "AI-assisted calendar that prevents delays and double-booking.",
              },
              {
                title: "Documents & E-Sign",
                description: "Send contracts, change orders, and estimates in one click.",
              },
              {
                title: "Payments",
                description: "Collect deposits and final payments instantly.",
              },
              {
                title: "Roofing AI",
                description: "Daily insights that protect your profit and keep every job on track.",
              },
              {
                title: "Automations",
                description: "Smart rules that handle repetitive office tasks for you.",
              },
            ].map((feature, i) => (
              <div key={i} className="p-6 border-2 border-gray-200 rounded-lg bg-white hover:border-gray-900 transition-colors">
                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Preview Section */}
      <section className="px-6 py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-8">
            This is what running a roofing company should feel like.
          </h2>
          <div className="bg-gray-200 rounded-lg aspect-video mb-8 flex items-center justify-center">
            <p className="text-gray-500">Demo Preview - See it live in a walkthrough</p>
          </div>
          <Link href="/demo">
            <Button size="lg" variant="outline" className="border-2 border-gray-900 text-gray-900 hover:bg-gray-50">
              See the full demo →
            </Button>
          </Link>
        </div>
      </section>

      {/* ROI Section */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">More Revenue</h3>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>More booked estimates</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Better follow-up</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Faster approvals</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Less Chaos</h3>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Simple job scheduling</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Automated homeowner updates</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Clear job timelines</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">More Profit</h3>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Early margin risk detection</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>AI insights</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Automated payments</span>
                </li>
              </ul>
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 text-center">
            SmartSend replaces $2,000+ of tools for $99–$399/month.
          </p>
        </div>
      </section>

      {/* CTA Before Footer */}
      <section className="px-6 py-20 bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">
            Stop running your roofing company on chaos.
          </h2>
          <p className="text-2xl font-semibold mb-8 text-gray-300">
            Start running it on SmartSend.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/demo">
              <Button size="lg" className="bg-white text-gray-900 hover:bg-gray-100 px-8 py-4 text-lg">
                Get a Demo
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="border-2 border-white text-white hover:bg-gray-800 px-8 py-4 text-lg">
                See Pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
