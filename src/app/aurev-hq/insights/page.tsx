"use client";

import useSWR from "swr";
import { TrendingUp, DollarSign, Users, Target, ArrowRight } from "lucide-react";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function InsightsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black text-white p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
            ⚡ Growth Roadmap
          </h1>
          <p className="text-xl text-gray-400">
            Path to $100K MRR by June 2026
          </p>
        </div>

        {/* Executive Summary Card */}
        <div className="border rounded-2xl p-8 bg-gradient-to-br from-yellow-900/20 to-yellow-800/10 border-yellow-500/30">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">$100K MRR Target</h2>
              <p className="text-gray-400">$1.2M ARR with <5% churn, >40% gross margin</p>
            </div>
            <Target className="h-12 w-12 text-yellow-500" />
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <Metric value="$85K" label="Current MRR" trend="+12%" />
            <Metric value="$100K" label="Target MRR" trend="+$15K" />
            <Metric value="17.6%" label="Growth Needed" trend="6 months" />
          </div>
        </div>

        {/* Portfolio Revenue Map */}
        <div className="border rounded-2xl p-6 bg-gray-900/50 border-gray-800">
          <h2 className="text-2xl font-bold mb-4 text-yellow-500 flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            Portfolio Revenue Map
          </h2>
          <div className="space-y-4">
            <AppRevenue app="SmartSend ⚡" value="$50K" target="$60K" percentage={60} />
            <AppRevenue app="OpsGrid 🧩" value="$25K" target="$25K" percentage={25} />
            <AppRevenue app="Agent Cloud 🤖" value="$10K" target="$15K" percentage={15} />
          </div>
        </div>

        {/* Pricing Levers */}
        <div className="border rounded-2xl p-6 bg-gray-900/50 border-gray-800">
          <h2 className="text-2xl font-bold mb-4 text-yellow-500 flex items-center gap-2">
            <TrendingUp className="h-6 w-6" />
            Pricing Levers
          </h2>
          <div className="space-y-3">
            <Lever name="SmartSend Plans" current="Growth $49 / Pro $99" target="Growth $69 / Pro $129" effect="+22% ARPA" />
            <Lever name="AI Credit Add-ons" current="$0.02/credit" target="$0.03/credit" effect="+12% expansion" />
            <Lever name="Team Seats" current="5/plan cap" target="10 limit + $10/seat" effect="+5–8% expansion" />
            <Lever name="Annual Billing" current="10% discount" target="20% on annual" effect="+ stability" />
            <Lever name="Agency Resellers" current="30% share" target="Tiered 20–40%" effect="+volume channels" />
          </div>
        </div>

        {/* Tactical Timeline */}
        <div className="border rounded-2xl p-6 bg-gray-900/50 border-gray-800">
          <h2 className="text-2xl font-bold mb-4 text-yellow-500 flex items-center gap-2">
            <Users className="h-6 w-6" />
            Tactical Timeline
          </h2>
          <div className="space-y-3">
            <TimelineItem month="Nov–Dec 2025" milestone="Public relaunch campaign" focus="Visibility + onboarding" />
            <TimelineItem month="Jan 2026" milestone="Usage-based billing refinement" focus="Monetization" />
            <TimelineItem month="Feb 2026" milestone="Affiliate + reseller rollout" focus="Channel scaling" />
            <TimelineItem month="Mar 2026" milestone="Agent Cloud AI expansion" focus="Expansion revenue" />
            <TimelineItem month="Apr 2026" milestone="Unified HQ dashboard 2.0" focus="Retention" />
            <TimelineItem month="May 2026" milestone="Paid acquisition sprint" focus="Growth" />
            <TimelineItem month="Jun 2026" milestone="$100K MRR checkpoint" focus="Consolidation" />
          </div>
        </div>

        {/* KPIs */}
        <div className="border rounded-2xl p-6 bg-gray-900/50 border-gray-800">
          <h2 className="text-2xl font-bold mb-4 text-yellow-500">Executive KPIs</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <KPIRow metric="MRR" target="$100K+" tool="HQ Dashboard" />
            <KPIRow metric="Churn (net)" target="<5%" tool="Forecast Engine" />
            <KPIRow metric="CAC Payback" target="<30 days" tool="Stripe + Analytics" />
            <KPIRow metric="LTV/CAC" target=">5×" tool="Forecast Panel" />
            <KPIRow metric="Conversion Rate" target="10%" tool="Supabase metrics" />
            <KPIRow metric="ARPA" target="$60+" tool="SQL / HQ Billing" />
          </div>
        </div>

        {/* Action Items */}
        <div className="border rounded-2xl p-6 bg-gradient-to-br from-green-900/20 to-green-800/10 border-green-500/30">
          <h2 className="text-2xl font-bold mb-4 text-green-400">Next 30 Days</h2>
          <div className="space-y-2">
            <ActionItem text="Optimize pricing page — new Growth/Pro tiers" />
            <ActionItem text="Add annual plan toggle + savings highlight" />
            <ActionItem text="Launch affiliate & agency portals" />
            <ActionItem text="Publish 'Cold Email OS' case studies weekly" />
            <ActionItem text="Run HQ newsletter (top 5 insights/week)" />
            <ActionItem text="Instrument Stripe → Supabase analytics" />
          </div>
        </div>

        {/* Flywheel Diagram */}
        <div className="border rounded-2xl p-6 bg-gray-900/50 border-gray-800">
          <h2 className="text-2xl font-bold mb-4 text-yellow-500">Execution Flywheel</h2>
          <div className="space-y-2 text-gray-300">
            <FlywheelStep text="→ Acquire users through SmartSend demos" />
            <FlywheelStep text="→ Cross-sell OpsGrid (CRM workflows)" />
            <FlywheelStep text="→ Deploy AI agents from Agent Cloud" />
            <FlywheelStep text="→ Aggregate data in HQ dashboard" />
            <FlywheelStep text="→ Auto-surface upsells + retention triggers" />
            <FlywheelStep text="→ Feed insights back to SmartSend marketing" />
            <FlywheelStep text="→ Repeat" />
          </div>
          <p className="mt-4 text-sm text-gray-400 italic">
            The more data flows across the ecosystem, the stronger the retention and upsell engine.
          </p>
        </div>

        {/* Links */}
        <div className="flex items-center justify-between pt-4">
          <Link href="/aurev-hq/dashboard" className="text-yellow-400 hover:text-yellow-300 flex items-center gap-2">
            <ArrowRight className="h-4 w-4 rotate-180" />
            Back to HQ Dashboard
          </Link>
          <Link href="/dashboard/revenue" className="text-yellow-400 hover:text-yellow-300 flex items-center gap-2">
            Revenue Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Metric({ value, label, trend }: { value: string; label: string; trend: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
      <div className="text-xs text-green-500 mt-1">▲ {trend}</div>
    </div>
  );
}

function AppRevenue({ app, value, target, percentage }: { app: string; value: string; target: string; percentage: number }) {
  const current = parseInt(value.replace('$', '').replace('K', ''));
  const targetVal = parseInt(target.replace('$', '').replace('K', ''));
  const progress = (current / targetVal) * 100;
  
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-white font-medium">{app}</span>
        <span className="text-gray-400">{value} → {target}</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-3">
        <div 
          className="bg-gradient-to-r from-yellow-500 to-yellow-600 h-3 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 mt-1">{percentage}% of total portfolio</div>
    </div>
  );
}

function Lever({ name, current, target, effect }: { name: string; current: string; target: string; effect: string }) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
      <div className="flex-1">
        <div className="text-white font-medium">{name}</div>
        <div className="text-sm text-gray-400">{current} → {target}</div>
      </div>
      <div className="text-yellow-400 font-semibold">{effect}</div>
    </div>
  );
}

function TimelineItem({ month, milestone, focus }: { month: string; milestone: string; focus: string }) {
  return (
    <div className="flex items-start gap-4 p-3 bg-gray-800/50 rounded-lg">
      <div className="text-yellow-500 font-semibold text-sm w-24">{month}</div>
      <div className="flex-1">
        <div className="text-white font-medium">{milestone}</div>
        <div className="text-sm text-gray-400">{focus}</div>
      </div>
    </div>
  );
}

function KPIRow({ metric, target, tool }: { metric: string; target: string; tool: string }) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
      <div className="text-white font-medium">{metric}</div>
      <div className="text-yellow-400">{target}</div>
      <div className="text-xs text-gray-500">{tool}</div>
    </div>
  );
}

function ActionItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-green-500 mt-1">✓</span>
      <span className="text-gray-300">{text}</span>
    </div>
  );
}

function FlywheelStep({ text }: { text: string }) {
  return <div>{text}</div>;
}

