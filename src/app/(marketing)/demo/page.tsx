"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="px-6 py-20 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
          Your roofing company, running in 20 minutes.
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          No fluff. Real workflows. Real jobs. Real results.
        </p>
        <Link href="/signup">
          <Button size="lg" className="bg-gray-900 text-white hover:bg-gray-800 px-8 py-4 text-lg">
            Book Your Demo
          </Button>
        </Link>
      </section>

      {/* Demo Flow */}
      <section className="px-6 py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-12 text-center">
            See How SmartSend Runs Your Roofing Company
          </h2>
          
          <div className="space-y-12">
            {/* Step 1 - Lead */}
            <div className="bg-white border-2 border-gray-200 rounded-lg p-8">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center font-bold text-xl">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Lead</h3>
                  <p className="text-gray-700 mb-4">
                    AI Lead Engine finds homeowners who need roof work. Automated campaigns target neighborhoods with aging roofs. When homeowners reply, SmartSend detects it instantly.
                  </p>
                  <div className="bg-gray-100 rounded-lg p-4 text-sm text-gray-600">
                    Demo: See how campaigns run automatically, how replies are detected, and how leads flow into your pipeline.
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 - Estimate */}
            <div className="bg-white border-2 border-gray-200 rounded-lg p-8">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center font-bold text-xl">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Estimate</h3>
                  <p className="text-gray-700 mb-4">
                    Generate professional estimates from job details. Send them instantly. Homeowners review and approve. All automated. No manual follow-up needed.
                  </p>
                  <div className="bg-gray-100 rounded-lg p-4 text-sm text-gray-600">
                    Demo: Watch estimates get created, sent, and approved — all without you touching a thing.
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 - Contract */}
            <div className="bg-white border-2 border-gray-200 rounded-lg p-8">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center font-bold text-xl">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Contract</h3>
                  <p className="text-gray-700 mb-4">
                    Contracts sent automatically when estimates are approved. E-signature built in. Homeowners sign on their phone. Deposit collected instantly via Stripe.
                  </p>
                  <div className="bg-gray-100 rounded-lg p-4 text-sm text-gray-600">
                    Demo: See contracts get sent, signed, and deposits collected — all in one flow.
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4 - Schedule */}
            <div className="bg-white border-2 border-gray-200 rounded-lg p-8">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center font-bold text-xl">
                  4
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Schedule</h3>
                  <p className="text-gray-700 mb-4">
                    AI-assisted calendar prevents delays and double-booking. See every crew, every job, every material need. Schedule conflicts detected automatically.
                  </p>
                  <div className="bg-gray-100 rounded-lg p-4 text-sm text-gray-600">
                    Demo: Watch the calendar prevent conflicts, suggest optimal scheduling, and keep jobs on track.
                  </div>
                </div>
              </div>
            </div>

            {/* Step 5 - Crew */}
            <div className="bg-white border-2 border-gray-200 rounded-lg p-8">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center font-bold text-xl">
                  5
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Crew</h3>
                  <p className="text-gray-700 mb-4">
                    Field app lets crews check in, upload photos, add notes. Everything syncs instantly. You see what's happening in real-time. Homeowners see progress automatically.
                  </p>
                  <div className="bg-gray-100 rounded-lg p-4 text-sm text-gray-600">
                    Demo: See photos upload, notes sync, and homeowner updates happen automatically.
                  </div>
                </div>
              </div>
            </div>

            {/* Step 6 - Photos */}
            <div className="bg-white border-2 border-gray-200 rounded-lg p-8">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center font-bold text-xl">
                  6
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Photos</h3>
                  <p className="text-gray-700 mb-4">
                    Crew photos sync to homeowner portal instantly. No more "can you send me photos?" calls. Homeowners see progress automatically.
                  </p>
                  <div className="bg-gray-100 rounded-lg p-4 text-sm text-gray-600">
                    Demo: Watch photos flow from field to homeowner portal automatically.
                  </div>
                </div>
              </div>
            </div>

            {/* Step 7 - Final Payment */}
            <div className="bg-white border-2 border-gray-200 rounded-lg p-8">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center font-bold text-xl">
                  7
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Final Payment</h3>
                  <p className="text-gray-700 mb-4">
                    When jobs are complete, invoices sent automatically. Homeowners pay with one click via Stripe. You get paid faster. Less chasing. More cash flow.
                  </p>
                  <div className="bg-gray-100 rounded-lg p-4 text-sm text-gray-600">
                    Demo: See invoices get sent and payments collected automatically when jobs finish.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* All Automated Badge */}
          <div className="mt-12 bg-gray-900 text-white rounded-lg p-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
              <h3 className="text-2xl font-bold">All Automated</h3>
            </div>
            <p className="text-lg text-gray-300 mb-6">
              Every step runs automatically. AI reviews everything. You stay in control. No chaos.
            </p>
            <Link href="/signup">
              <Button size="lg" className="bg-white text-gray-900 hover:bg-gray-100 px-8 py-4 text-lg">
                Book Your Demo
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">
            Ready to see SmartSend in action?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Book a demo and see how your roofing company runs on autopilot.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/signup">
              <Button size="lg" className="bg-white text-gray-900 hover:bg-gray-100 px-8 py-4 text-lg">
                Book Your Demo
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







































