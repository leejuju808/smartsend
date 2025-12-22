import RevenueSnapshotTile from "@/app/dashboard/_components/RevenueSnapshotTile";
import TodayTasks from "@/app/dashboard/today-tasks";
import InboxPage from "@/app/dashboard/inbox/page";
import { PlanUsageBanner } from "@/components/dashboard/PlanUsageBanner";
import { DailyDirectionBanner } from "@/components/dashboard/DailyDirectionBanner";
import HotJobsList from "@/components/dashboard/HotJobsList";
import { JobPipelineBoard } from "@/components/dashboard/JobPipelineBoard";
import { WeeklyWins } from "@/components/dashboard/WeeklyWins";
import { DailyBriefingCard } from "@/components/dashboard/DailyBriefingCard";
import { RevenueOverview } from "@/components/dashboard/RevenueOverview";
import { HotLeadAcceleratorCard } from "@/components/dashboard/HotLeadAcceleratorCard";
import { EstimatorPerformanceScores } from "@/components/dashboard/EstimatorPerformanceScores";
import { LeadSourceIntelligence } from "@/components/dashboard/LeadSourceIntelligence";
import { TopLossReasonsWidget } from "@/components/dashboard/TopLossReasonsWidget";
import { MaterialPriceAlertsCard } from "@/components/dashboard/MaterialPriceAlertsCard";
import { VarianceAlertsPanel } from "@/components/dashboard/VarianceAlertsPanel";
import { ProductionAlertsPanel } from "@/components/production/ProductionAlertsPanel";
import { SafetyOverviewPanel } from "@/components/dashboard/SafetyOverviewPanel";
import { ReputationPanel } from "@/components/dashboard/ReputationPanel";
import { RiskDashboard } from "@/components/dashboard/RiskDashboard";
import { InsuranceCommandCenter } from "@/components/dashboard/InsuranceCommandCenter";
import { MultiBranchDashboard } from "@/components/dashboard/MultiBranchDashboard";
import { OwnerHQCommandBoard } from "@/components/dashboard/OwnerHQCommandBoard";

export default function OwnerDashboardPage() {
  return (
    <div className="space-y-4">
      {/* Guardrail C & D: Plan Usage Banner */}
      <PlanUsageBanner />
      
      {/* Block 95000: Daily Direction Banner - Your ONE most important action today */}
      <DailyDirectionBanner />
      
      {/* Block 63000: Risk Detection + Warranty Liability AI System */}
      <RiskDashboard />
      
      {/* Block 56000: Customer Review + Reputation Automation System */}
      <ReputationPanel />
      
      {/* Block 49000: Safety Compliance + OSHA Checklist System */}
      <SafetyOverviewPanel />
      
      {/* Block 66000: Insurance Claim Assistant + Scope Verification AI System */}
      <InsuranceCommandCenter />
      
      {/* Block 254500: Enterprise Command Center v1 - Multi-Branch Dashboard & Owner HQ Command Board */}
      <OwnerHQCommandBoard />
      <MultiBranchDashboard />
      
      {/* Block 22710: Production Alerts - Material delays, readiness changes, schedule updates */}
      <ProductionAlertsPanel />
      
      {/* Block 22510: Material Price Alerts - Catch price hikes before they eat job profit */}
      <MaterialPriceAlertsCard />
      
      {/* Block 22600: Variance Alerts - See which jobs are drifting toward loss */}
      <VarianceAlertsPanel />
      
      {/* Block 61000: AI Profit Maximizer + Pricing Optimization Engine */}
      <div className="bg-gradient-to-r from-emerald-500/20 via-emerald-400/10 to-transparent border border-emerald-500/40 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-emerald-300 mb-1">
              AI Profit Maximizer
            </h3>
            <p className="text-xs text-zinc-400">
              Live profit analysis • AI price recommendations • Underbid detection • Upsell suggestions
            </p>
          </div>
          <a
            href="/dashboard/profit"
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            View Profit Dashboard
          </a>
        </div>
      </div>
      
      {/* Block 21738: Daily Briefing - Today's Money Snapshot */}
      <DailyBriefingCard />
      
      {/* Block 21742: Revenue Tracker - Monthly Revenue Summary */}
      <RevenueOverview />
      
      {/* Block 21744: Hot Lead Accelerator - Speed-to-Lead Tracking */}
      <HotLeadAcceleratorCard />
      
      {/* Block 21723: This Week's Wins */}
      <WeeklyWins />
      
      {/* Block 21722: Job Pipeline Money Board */}
      <JobPipelineBoard />
      
      {/* Block 21582: Hot Jobs Focus List */}
      <HotJobsList />
      
      {/* Block 21958: Estimator Performance Scores */}
      <EstimatorPerformanceScores />
      
      {/* Block 21966: Lead Source Intelligence - Which Leads Make You Money */}
      <LeadSourceIntelligence />
      
      {/* Block 22210: Top Loss Reasons This Month */}
      <TopLossReasonsWidget />
      
      {/* Row 1: Money + Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RevenueSnapshotTile />
        <TodayTasks />
      </div>

      {/* Row 2: Inbox Command Center */}
      <section className="mt-2">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Active Homeowner Conversations
            </h2>
            <p className="text-[11px] text-slate-500">
              SmartSend reads replies, labels intent, and turns them into tasks.
            </p>
          </div>
          <span className="text-[10px] text-slate-400">
            Inbox · Intent · Tasks
          </span>
        </div>

        <div className="h-[480px]">
          <InboxPage />
        </div>
      </section>
    </div>
  );
}
