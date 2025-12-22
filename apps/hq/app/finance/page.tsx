"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@aurev/ui";

interface CategoryData {
  allocation: number;
  spent: number;
  goal: string;
  color: string;
}

interface FinanceData {
  raised: number;
  categories: Record<string, CategoryData>;
  burnRate: number;
  runway: number;
  currentARR: number;
  targetARR: number;
}

export default function FinancePage() {
  // Seed capital data: $1.5M raise
  const financeData: FinanceData = {
    raised: 1500000,
    currentARR: 3200000,
    targetARR: 10000000,
    burnRate: 105000, // Current monthly burn
    runway: 15, // Months of runway
    categories: {
      team: {
        allocation: 525000,
        spent: 150000,
        goal: "Scale engineering + growth",
        color: "text-blue-400",
      },
      marketing: {
        allocation: 300000,
        spent: 45000,
        goal: "Drive inbound flywheel",
        color: "text-purple-400",
      },
      infra: {
        allocation: 225000,
        spent: 120000,
        goal: "Support 10× usage",
        color: "text-green-400",
      },
      legal: {
        allocation: 75000,
        spent: 15000,
        goal: "Data, AI compliance, enterprise contracts",
        color: "text-yellow-400",
      },
      reserve: {
        allocation: 375000,
        spent: 0,
        goal: "12–15 month burn protection",
        color: "text-amber-400",
      },
    },
  };

  const totalAllocated = Object.values(financeData.categories).reduce(
    (sum, cat) => sum + cat.allocation,
    0
  );

  const totalSpent = Object.values(financeData.categories).reduce(
    (sum, cat) => sum + cat.spent,
    0
  );

  const remaining = financeData.raised - totalAllocated;

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Seed Capital Dashboard</h1>
        <p className="text-gray-400">
          Track deployment, burn rate, and runway for $3M → $10M ARR scaling
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-1">Raised</h3>
          <p className="text-3xl font-bold text-white">${(financeData.raised / 1000000).toFixed(1)}M</p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-1">Monthly Burn</h3>
          <p className="text-3xl font-bold text-red-400">${(financeData.burnRate / 1000).toFixed(0)}k</p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-1">Runway</h3>
          <p className="text-3xl font-bold text-amber-400">{financeData.runway} mo</p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-1">Target ARR</h3>
          <p className="text-3xl font-bold text-green-400">${(financeData.targetARR / 1000000).toFixed(1)}M</p>
        </Card>
      </div>

      {/* Capital Allocation */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-6">Capital Allocation</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {Object.entries(financeData.categories).map(([key, data]) => {
            const percentage = ((data.spent / data.allocation) * 100).toFixed(0);
            return (
              <Card key={key} className="p-6">
                <CardHeader className="p-0 mb-4">
                  <CardTitle className="text-lg font-semibold capitalize">{key}</CardTitle>
                  <CardDescription className="text-xs">{data.goal}</CardDescription>
                </CardHeader>
                <CardContent className="p-0 space-y-3">
                  <div>
                    <p className={`text-3xl font-bold ${data.color}`}>
                      ${(data.allocation / 1000).toFixed(0)}k
                    </p>
                    <p className="text-sm text-gray-500">Allocated</p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Spent</span>
                      <span className="text-white font-medium">
                        ${(data.spent / 1000).toFixed(0)}k ({percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div
                        className="bg-amber-400 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-800">
                    <p className="text-xs text-gray-400">
                      Remaining: ${((data.allocation - data.spent) / 1000).toFixed(0)}k
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <Card className="p-6 mb-8">
        <h3 className="text-lg font-semibold text-white mb-4">Deployment Summary</h3>
        <div className="grid md:grid-cols-4 gap-6 text-sm">
          <div>
            <p className="text-gray-400 mb-1">Total Allocated</p>
            <p className="text-2xl font-bold text-white">${(totalAllocated / 1000).toFixed(0)}k</p>
          </div>
          <div>
            <p className="text-gray-400 mb-1">Total Spent</p>
            <p className="text-2xl font-bold text-red-400">${(totalSpent / 1000).toFixed(0)}k</p>
          </div>
          <div>
            <p className="text-gray-400 mb-1">Available</p>
            <p className="text-2xl font-bold text-green-400">
              ${((financeData.raised - totalSpent) / 1000).toFixed(0)}k
            </p>
          </div>
          <div>
            <p className="text-gray-400 mb-1">Spend Rate</p>
            <p className="text-2xl font-bold text-amber-400">
              {((totalSpent / financeData.raised) * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </Card>

      {/* Hiring Plan */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-6">Key Hires (12-Month Contract)</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Full-Stack Engineer</h3>
                <p className="text-sm text-gray-400">Month 1</p>
              </div>
              <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full">
                Active
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-3">
              Maintain & optimize AUREV SDK + apps
            </p>
            <p className="text-xs text-gray-500">ROI: Faster iteration cycles</p>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Growth Engineer</h3>
                <p className="text-sm text-gray-400">Month 2</p>
              </div>
              <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-1 rounded-full">
                Planned
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-3">
              Manage SmartSend funnels + conversion AI
            </p>
            <p className="text-xs text-gray-500">ROI: Increased activation</p>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Head of Product Design</h3>
                <p className="text-sm text-gray-400">Month 3</p>
              </div>
              <span className="bg-gray-500/20 text-gray-400 text-xs px-2 py-1 rounded-full">
                Planned
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-3">
              Maintain AUREV 2.0 design system
            </p>
            <p className="text-xs text-gray-500">ROI: Brand + UX trust</p>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Content Ops Manager</h3>
                <p className="text-sm text-gray-400">Month 3</p>
              </div>
              <span className="bg-gray-500/20 text-gray-400 text-xs px-2 py-1 rounded-full">
                Planned
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-3">
              SEO + automated blog system (AI-assisted)
            </p>
            <p className="text-xs text-gray-500">ROI: Inbound scale</p>
          </Card>

          <Card className="p-6 md:col-span-2">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Customer Success Lead</h3>
                <p className="text-sm text-gray-400">Month 4</p>
              </div>
              <span className="bg-gray-500/20 text-gray-400 text-xs px-2 py-1 rounded-full">
                Planned
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-3">
              Enterprise onboarding + retention automation
            </p>
            <p className="text-xs text-gray-500">ROI: Lower churn</p>
          </Card>
        </div>
      </div>

      {/* Growth Investment */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-6">Growth Investment Plan</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Growth Channels</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🚀</span>
                <div>
                  <p className="font-medium text-white">SmartSend Growth Loops</p>
                  <p className="text-sm text-gray-400">
                    Scale outreach agents to 3 verticals (agencies, SaaS, recruiting)
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">📺</span>
                <div>
                  <p className="font-medium text-white">YouTube + X Presence</p>
                  <p className="text-sm text-gray-400">
                    $5–7k/mo content engine — weekly demos, case studies, behind-builds
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">🤝</span>
                <div>
                  <p className="font-medium text-white">Referral Accelerator</p>
                  <p className="text-sm text-gray-400">$25k incentive pool for partner resellers</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">💬</span>
                <div>
                  <p className="font-medium text-white">Community Hub</p>
                  <p className="text-sm text-gray-400">
                    AUREV HQ Slack/Discord community → early adopter network
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Infrastructure Scaling</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-400">✓</span>
                <span className="text-gray-300">Supabase → Pro 16 core plan (RLS scaling, 5 TB storage)</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-400">✓</span>
                <span className="text-gray-300">Vercel → Enterprise Edge regions</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-400">✓</span>
                <span className="text-gray-300">Stripe → Advanced Revenue Recognition</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-400">✓</span>
                <span className="text-gray-300">Cloudflare → image caching + WAF rules</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-yellow-400">⚠</span>
                <span className="text-gray-300">Scheduled functions → distributed Deno Deploy region pools</span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-800">
              <h4 className="text-sm font-semibold text-white mb-3">Infrastructure Targets</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Current Orgs</p>
                  <p className="text-xl font-bold text-white">500</p>
                </div>
                <div>
                  <p className="text-gray-400">Target Orgs</p>
                  <p className="text-xl font-bold text-green-400">2,500+</p>
                </div>
                <div>
                  <p className="text-gray-400">Current ARR</p>
                  <p className="text-xl font-bold text-white">$3.2M</p>
                </div>
                <div>
                  <p className="text-gray-400">Target ARR</p>
                  <p className="text-xl font-bold text-green-400">$10M+</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Runway Protection */}
      <Card className="p-6 bg-gradient-to-br from-amber-500/10 to-red-500/10 border-amber-500/30">
        <h3 className="text-lg font-semibold text-white mb-4">Runway Protection Strategy</h3>
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm font-medium text-gray-400 mb-2">Current Runway</p>
            <p className="text-3xl font-bold text-white">{financeData.runway} months</p>
            <p className="text-xs text-gray-500 mt-1">
              Target: 15+ months buffer
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-400 mb-2">Monthly Burn</p>
            <p className="text-3xl font-bold text-red-400">${(financeData.burnRate / 1000).toFixed(0)}k</p>
            <p className="text-xs text-gray-500 mt-1">
              Controlled growth: < $120k/mo
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-400 mb-2">Profit Discipline</p>
            <p className="text-3xl font-bold text-green-400">Active</p>
            <p className="text-xs text-gray-500 mt-1">
              KPI-based extensions only
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

