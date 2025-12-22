"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ArrowRight } from "lucide-react";

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="px-6 py-16 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Everything You Need to Run Your Roofing Company
        </h1>
        <p className="text-xl text-gray-600">
          Built specifically for roofers. No fluff. Just results.
        </p>
      </section>

      {/* Section 1 - AI Lead Engine */}
      <section className="px-6 py-20 border-t">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">AI Lead Engine</h2>
          <p className="text-lg text-gray-700 mb-6">
            Get roofing jobs on autopilot without buying ads. SmartSend runs targeted campaigns that find homeowners who need roof work, detects replies automatically, and follows up until jobs are booked.
          </p>
          <div className="space-y-4 text-gray-700">
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Automated campaigns that target neighborhoods with aging roofs</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>AI reply detection — knows when homeowners respond</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Smart follow-up sequences that convert leads to estimates</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>No manual email checking — everything happens automatically</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2 - Scheduling & Production */}
      <section className="px-6 py-20 bg-gray-50 border-t">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">Scheduling & Production</h2>
          <p className="text-lg text-gray-700 mb-6">
            AI-assisted calendar that prevents delays and double-booking. See every crew, every job, and every material need in one view.
          </p>
          <div className="space-y-4 text-gray-700">
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Crew calendar that shows availability and conflicts</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Delay detection — alerts you before jobs fall behind</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Material tracking and ordering reminders</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Job progress updates automatically sync to homeowner portal</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3 - Documents & E-Sign */}
      <section className="px-6 py-20 border-t">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">Documents & E-Sign</h2>
          <p className="text-lg text-gray-700 mb-6">
            Send contracts, change orders, and estimates in one click. Homeowners sign digitally. No printing. No scanning. No delays.
          </p>
          <div className="space-y-4 text-gray-700">
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Professional estimates generated from job details</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Contracts and change orders sent instantly</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>E-signature built in — homeowners sign on their phone</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>All documents stored automatically — never lose a contract</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4 - Payments */}
      <section className="px-6 py-20 bg-gray-50 border-t">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">Payments</h2>
          <p className="text-lg text-gray-700 mb-6">
            Collect deposits and final payments instantly. Stripe integration means homeowners pay with a click. You get paid faster. Less chasing. More cash flow.
          </p>
          <div className="space-y-4 text-gray-700">
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Deposit collection when contracts are signed</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Final payment invoices sent automatically</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Stripe integration — secure, fast, trusted</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Payment reminders for overdue invoices</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5 - Homeowner Portal */}
      <section className="px-6 py-20 border-t">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">Homeowner Portal</h2>
          <p className="text-lg text-gray-700 mb-6">
            Transparency builds trust. Every homeowner gets a portal where they see job progress, documents, photos, and payment status. Fewer calls. More confidence.
          </p>
          <div className="space-y-4 text-gray-700">
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Real-time job timeline — homeowners see what's happening</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Photo updates from the field</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Document access — contracts, estimates, invoices</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Payment portal — homeowners pay directly</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 6 - Field App */}
      <section className="px-6 py-20 bg-gray-50 border-t">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">Field App</h2>
          <p className="text-lg text-gray-700 mb-6">
            Crews check in, upload photos, add notes. Everything syncs instantly. You see what's happening in real-time. No more "where's the crew?" calls.
          </p>
          <div className="space-y-4 text-gray-700">
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Photo uploads from job sites</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Check-in and check-out tracking</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Field notes sync to office instantly</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Works on any phone — no app download needed</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 7 - AI Insights */}
      <section className="px-6 py-20 border-t">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">AI Insights</h2>
          <p className="text-lg text-gray-700 mb-6">
            Daily insights that protect your profit and keep every job on track. Know about margin risk before it's too late. See schedule conflicts before they happen.
          </p>
          <div className="space-y-4 text-gray-700">
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Margin risk detection — alerts when jobs are losing money</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Schedule risk alerts — prevents double-booking</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Material prediction — knows what you'll need before you order</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Daily dashboard — see everything that needs attention</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 8 - Automations */}
      <section className="px-6 py-20 bg-gray-50 border-t">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">Automations</h2>
          <p className="text-lg text-gray-700 mb-6">
            Smart rules that handle repetitive office tasks for you. Set it once. It keeps running. Less busywork. More time to grow your business.
          </p>
          <div className="space-y-4 text-gray-700">
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Overdue invoice reminders — automatic follow-up</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Material delay alerts — know when suppliers are late</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Review request automation — get 5-star reviews automatically</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Homeowner update emails — keep customers informed</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gray-900 font-semibold">•</span>
              <span>Custom automations — build rules that fit your workflow</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 bg-gray-900 text-white border-t">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">
            Ready to run your roofing company on SmartSend?
          </h2>
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
































