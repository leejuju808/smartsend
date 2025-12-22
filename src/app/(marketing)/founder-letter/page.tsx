"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function FounderLetterPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="px-6 py-20 max-w-4xl mx-auto">
        <div className="mb-12">
          <Link href="/" className="text-gray-600 hover:text-gray-900 transition-colors">
            ← Back to Home
          </Link>
        </div>
        
        <div className="prose prose-lg max-w-none">
          <h1 className="text-4xl font-bold text-gray-900 mb-8">
            Why I Built SmartSend
          </h1>

          <div className="text-lg text-gray-700 space-y-6 leading-relaxed">
            <p className="text-2xl font-semibold text-gray-900">
              Roofing companies are drowning in chaos — and nobody built software that actually fixes it.
            </p>

            <p>
              Roofers don't need another CRM.
            </p>

            <p>
              They don't need another document portal.
            </p>

            <p>
              They don't need another scheduling board.
            </p>

            <p>
              They definitely don't need another "AI tool."
            </p>

            <p className="text-xl font-semibold text-gray-900 mt-8">
              They need a system that:
            </p>

            <ul className="list-none space-y-3 pl-0">
              <li className="flex items-start gap-3">
                <span className="text-gray-900 font-semibold mt-1">•</span>
                <span>books jobs automatically</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-gray-900 font-semibold mt-1">•</span>
                <span>runs every crew smoothly</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-gray-900 font-semibold mt-1">•</span>
                <span>protects profit</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-gray-900 font-semibold mt-1">•</span>
                <span>communicates with homeowners</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-gray-900 font-semibold mt-1">•</span>
                <span>catches problems early</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-gray-900 font-semibold mt-1">•</span>
                <span>reduces busywork</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-gray-900 font-semibold mt-1">•</span>
                <span>makes the owner feel in control</span>
              </li>
            </ul>

            <p className="text-xl font-semibold text-gray-900 mt-8">
              That's why I built SmartSend.
            </p>

            <p>
              Not to make software —
            </p>

            <p className="text-xl font-semibold text-gray-900">
              to build the operating system roofing companies never had.
            </p>

            <p className="mt-8">
              If you're tired of running your business manually…
            </p>

            <p>
              If you're tired of fires every week…
            </p>

            <p>
              If you want AI to actually DO THE WORK instead of just impressing you…
            </p>

            <p className="text-xl font-semibold text-gray-900 mt-8">
              Then SmartSend was built for you.
            </p>

            <p className="text-xl font-semibold text-gray-900">
              And I'd love to show you what it can do.
            </p>

            <div className="mt-12 pt-8 border-t border-gray-300">
              <p className="text-lg font-semibold text-gray-900 mb-2">
                — Julian Lee
              </p>
              <p className="text-gray-600">
                Founder, SmartSend AI
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 flex gap-4 flex-wrap">
          <Link href="/demo">
            <Button size="lg" className="bg-gray-900 text-white hover:bg-gray-800 px-8 py-4 text-lg">
              See What SmartSend Can Do
            </Button>
          </Link>
          <Link href="/pricing">
            <Button size="lg" variant="outline" className="border-2 border-gray-900 text-gray-900 hover:bg-gray-50 px-8 py-4 text-lg">
              See Pricing
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}







































