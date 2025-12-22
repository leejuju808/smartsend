import { createClient } from "@supabase/supabase-js";

// Core types for Executive Brain outputs
export type HealthCategoryKey = "sales" | "production" | "finances" | "reputation" | "staffing";

export interface BusinessHealthCategories {
  sales: number;
  production: number;
  finances: number;
  reputation: number;
  staffing: number;
}

export interface BusinessHealthScoreResult {
  companyId: string;
  snapshotDate: string;
  overallScore: number;
  categories: BusinessHealthCategories;
  weakAreas: string[];
  strongAreas: string[];
}

export interface ExecutiveAlertSummary {
  id: string;
  alert_type: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  created_at: string;
}

export interface ExecutiveRecommendationSummary {
  id: string;
  recommendation: string;
  category: string;
  target_date: string;
  created_at: string;
}

export interface WinsProblemsSummary {
  wins: string[];
  problems: string[];
}

export interface CashFlowForecast {
  incomingExpected: number;
  incomingSupplements: number;
  outgoingPayroll: number;
  outgoingSubs: number;
  outgoingMaterials: number;
  projectedCashFlow: number;
  riskLevel: "low" | "medium" | "high";
}

export interface OwnerDailyBriefing {
  companyId: string;
  companyName?: string;
  date: string;
  health: BusinessHealthScoreResult;
  alerts: ExecutiveAlertSummary[];
  recommendations: ExecutiveRecommendationSummary[];
  winsProblems: WinsProblemsSummary;
  cashFlow: CashFlowForecast | null;
  // Render-ready narrative blocks
  headline: string;
  highlights: string[];
  risks: string[];
  opportunities: string[];
}

// Helper: create a service-role supabase client (server-side only)
function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are not configured for Executive Brain.");
  }

  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// BUSINESS HEALTH SCORE ENGINE
// ---------------------------------------------------------------------------

export async function computeBusinessHealthScore(roofingCompanyId: string): Promise<BusinessHealthScoreResult> {
  const supabase = getServiceSupabase();
  const today = new Date();
  const snapshotDate = today.toISOString().slice(0, 10);

  // 1) Pull company-level metrics from multi-company owner views
  const { data: companyRows } = await supabase
    .from("v_owner_company_comparison")
    .select("company_id, company_name, completed_jobs, active_jobs, total_leads, leads_in_pipeline, total_revenue, revenue_this_month")
    .eq("company_id", roofingCompanyId)
    .limit(1);

  const company = companyRows?.[0] as any | undefined;

  // 2) Pull sales rep close rates
  const { data: salesRows } = await supabase
    .from("v_owner_sales_rep_rankings")
    .select("company_id, close_rate_percent")
    .eq("company_id", roofingCompanyId);

  const closeRates = (salesRows ?? []).map((r: any) => Number(r.close_rate_percent || 0));
  const avgCloseRate = closeRates.length ? closeRates.reduce((a, b) => a + b, 0) / closeRates.length : 0;

  // 3) Pull crew performance for production efficiency proxy
  const { data: crewRows } = await supabase
    .from("v_owner_crew_performance")
    .select("company_id, jobs_completed, avg_hours_per_job, avg_labor_cost_per_job")
    .eq("company_id", roofingCompanyId);

  const totalJobsCompleted = (crewRows ?? []).reduce((sum: number, r: any) => sum + Number(r.jobs_completed || 0), 0);

  // Fallbacks when data is sparse
  const totalLeads = Number(company?.total_leads ?? 0);
  const leadsInPipeline = Number(company?.leads_in_pipeline ?? 0);
  const completedJobs = Number(company?.completed_jobs ?? company?.completed_jobs ?? 0);
  const activeJobs = Number(company?.active_jobs ?? 0);
  const totalRevenue = Number(company?.total_revenue ?? 0);
  const revenueThisMonth = Number(company?.revenue_this_month ?? 0);

  // -----------------------------------------------------------------------
  // Category scoring heuristics (0–100)
  // These are intentionally simple and based on robust, monotonic heuristics
  // that can be refined later without breaking the schema.
  // -----------------------------------------------------------------------

  // Sales health: combination of close rate and pipeline depth
  const closeScore = Math.max(0, Math.min(100, avgCloseRate)); // close_rate_percent already 0–100
  const pipelineRatio = totalLeads ? leadsInPipeline / totalLeads : 0;
  const pipelineScore = Math.max(0, Math.min(100, pipelineRatio * 120)); // generous if a lot is still in pipeline
  const sales = clamp01((0.6 * (closeScore / 100)) + (0.4 * (pipelineScore / 100))) * 100;

  // Production health: how many jobs are moving and being completed
  const activeToCompletedRatio = completedJobs
    ? activeJobs / completedJobs
    : activeJobs > 0
    ? 1.5
    : 0;
  // If active >> completed, production is strained
  let productionRaw = 1 - Math.min(activeToCompletedRatio / 3, 1); // if ratio >= 3, score bottoms
  if (!Number.isFinite(productionRaw) || productionRaw < 0) productionRaw = 0;
  const production = clamp01(0.3 + 0.7 * productionRaw) * 100; // small base so brand-new orgs aren't 0

  // Financial health: how strong this month is vs overall history
  const monthShare = totalRevenue > 0 ? revenueThisMonth / totalRevenue : 0;
  // If 10–20% of lifetime revenue is this month, assume strong; <2% weak
  const finances = clamp01((monthShare - 0.02) / (0.2 - 0.02)) * 100;

  // Reputation proxy: currently we don't have direct reviews here; use close rate as proxy
  const reputation = clamp01(closeScore / 100) * 100;

  // Staffing proxy: if jobs per crew or rep are extremely high, staffing score drops
  const totalCrews = (crewRows ?? []).length;
  const jobsPerCrew = totalCrews ? totalJobsCompleted / totalCrews : completedJobs;
  const staffingLoad = jobsPerCrew; // higher = more load
  // 0 jobs/crew => neutral, 5–8 jobs/crew => healthy, 15+ => overloaded
  let staffing = 80;
  if (staffingLoad <= 2) staffing = 70;
  else if (staffingLoad <= 8) staffing = 90;
  else if (staffingLoad <= 15) staffing = 75;
  else staffing = 55;

  const categories: BusinessHealthCategories = {
    sales: roundOneDecimal(sales),
    production: roundOneDecimal(production),
    finances: roundOneDecimal(finances),
    reputation: roundOneDecimal(reputation),
    staffing: roundOneDecimal(staffing),
  };

  // Overall score: weighted average
  const overall =
    categories.sales * 0.25 +
    categories.production * 0.25 +
    categories.finances * 0.25 +
    categories.reputation * 0.15 +
    categories.staffing * 0.10;

  // Strong/weak areas for narrative
  const entries = Object.entries(categories) as [HealthCategoryKey, number][];
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const strongAreas = sorted
    .filter(([, score]) => score >= 80)
    .map(([key]) => prettyCategory(key));
  const weakAreas = sorted
    .filter(([, score]) => score <= 70)
    .map(([key]) => prettyCategory(key));

  // Persist into executive_health_scores for historical trend
  await supabase.from("executive_health_scores").upsert(
    {
      roofing_company_id: roofingCompanyId,
      overall_score: roundOneDecimal(overall),
      categories,
      snapshot_date: snapshotDate,
      notes: null,
    },
    { onConflict: "roofing_company_id,snapshot_date" }
  );

  return {
    companyId: roofingCompanyId,
    snapshotDate,
    overallScore: roundOneDecimal(overall),
    categories,
    weakAreas,
    strongAreas,
  };
}

// ---------------------------------------------------------------------------
// STRATEGIC ALERT AND RECOMMENDATION ENGINE
// ---------------------------------------------------------------------------

export async function generateStrategicAlerts(roofingCompanyId: string): Promise<ExecutiveAlertSummary[]> {
  const supabase = getServiceSupabase();

  const health = await computeBusinessHealthScore(roofingCompanyId);
  const alerts: Array<Partial<ExecutiveAlertSummary> & { context?: any }> = [];

  // Margin / revenue soft spot => financial alert
  if (health.categories.finances < 70) {
    alerts.push({
      alert_type: "financial",
      message: "Financial performance needs attention — this month is soft versus historical revenue.",
      severity: "high",
      context: { finances: health.categories.finances },
    });
  }

  // Production bottleneck
  if (health.categories.production < 70) {
    alerts.push({
      alert_type: "production",
      message: "Production is backed up — too many active jobs vs. completions.",
      severity: "high",
      context: { production: health.categories.production },
    });
  }

  // Sales weak
  if (health.categories.sales < 70) {
    alerts.push({
      alert_type: "sales",
      message: "Sales close rate and pipeline need a push.",
      severity: "medium",
      context: { sales: health.categories.sales },
    });
  }

  const created: ExecutiveAlertSummary[] = [];

  for (const a of alerts) {
    const { data, error } = await supabase
      .from("executive_alerts")
      .insert({
        roofing_company_id: roofingCompanyId,
        alert_type: a.alert_type,
        message: a.message,
        severity: a.severity,
        context: a.context ?? {},
      })
      .select("id, alert_type, message, severity, created_at")
      .single();

    if (!error && data) {
      created.push(data as ExecutiveAlertSummary);
    }
  }

  return created;
}

export async function generateExecutiveRecommendations(
  roofingCompanyId: string,
  health: BusinessHealthScoreResult
): Promise<ExecutiveRecommendationSummary[]> {
  const supabase = getServiceSupabase();
  const today = new Date().toISOString().slice(0, 10);

  const recs: Array<Partial<ExecutiveRecommendationSummary> & { category: string; context?: any }> = [];

  // Sales-focused actions
  if (health.categories.sales < 80) {
    recs.push({
      category: "sales",
      recommendation: "Review this week’s open estimates and call the top 10 by value to close them.",
      context: { reason: "sales_category_below_80", score: health.categories.sales },
    });
  }

  // Production actions
  if (health.categories.production < 80) {
    recs.push({
      category: "production",
      recommendation: "Review the production board and reassign at least one job from your most overloaded crew.",
      context: { reason: "production_category_below_80", score: health.categories.production },
    });
  }

  // Finance actions
  if (health.categories.finances < 80) {
    recs.push({
      category: "finance",
      recommendation: "Review AR over 30 days and schedule at least 3 collection calls for today.",
      context: { reason: "finances_category_below_80", score: health.categories.finances },
    });
  }

  const inserted: ExecutiveRecommendationSummary[] = [];

  for (const r of recs) {
    const { data, error } = await supabase
      .from("executive_recommendations")
      .insert({
        roofing_company_id: roofingCompanyId,
        recommendation: r.recommendation,
        category: r.category,
        context: r.context ?? {},
        target_date: today,
      })
      .select("id, recommendation, category, target_date, created_at")
      .single();

    if (!error && data) {
      inserted.push(data as ExecutiveRecommendationSummary);
    }
  }

  return inserted;
}

// ---------------------------------------------------------------------------
// WINS / PROBLEMS + CASH FLOW (V1 HEURISTICS + PLACEHOLDERS)
// ---------------------------------------------------------------------------

export async function deriveWinsAndProblems(health: BusinessHealthScoreResult): Promise<WinsProblemsSummary> {
  const wins: string[] = [];
  const problems: string[] = [];

  for (const [key, score] of Object.entries(health.categories) as [HealthCategoryKey, number][]) {
    const label = prettyCategory(key);
    if (score >= 85) wins.push(`${label} is a strong advantage right now.`);
    if (score <= 70) problems.push(`${label} needs attention.`);
  }

  if (!wins.length) wins.push("Operations are generally stable — no major red flags in the core metrics.");
  if (!problems.length) problems.push("No major problem areas detected in the main health categories.");

  return { wins, problems };
}

// NOTE: For V1 we keep the cash flow forecast simple. As more detailed
// AR, AP, payroll, and material cost tables are wired into the system,
// this function can be expanded without changing the public API.
export async function computeCashFlowForecast(_roofingCompanyId: string): Promise<CashFlowForecast | null> {
  // Placeholder heuristic until full financial datasets are wired in.
  // We intentionally return a conservative, low-risk forecast that can
  // be refined once AR/AP + payroll data are integrated.
  return null;
}

// ---------------------------------------------------------------------------
// OWNER DAILY BRIEFING COMPOSER
// ---------------------------------------------------------------------------

export async function generateOwnerDailyBriefing(roofingCompanyId: string): Promise<OwnerDailyBriefing> {
  const supabase = getServiceSupabase();

  const health = await computeBusinessHealthScore(roofingCompanyId);
  const alerts = await generateStrategicAlerts(roofingCompanyId);
  const recs = await generateExecutiveRecommendations(roofingCompanyId, health);
  const winsProblems = await deriveWinsAndProblems(health);
  const cashFlow = await computeCashFlowForecast(roofingCompanyId);

  // Get company name for context
  const { data: companyRow } = await supabase
    .from("roofing_companies")
    .select("id, name")
    .eq("id", roofingCompanyId)
    .maybeSingle();

  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);

  const highlights: string[] = [];

  highlights.push(`Company Health Score: ${health.overallScore.toFixed(1)}/100`);

  // Basic narrative around health
  if (health.overallScore >= 85) {
    highlights.push("Business is in a strong position — keep doing what’s working.");
  } else if (health.overallScore >= 70) {
    highlights.push("Business is stable but has a few areas that need attention.");
  } else {
    highlights.push("Business health needs focused attention today.");
  }

  const risks = alerts
    .filter((a) => a.severity === "high" || a.severity === "critical")
    .map((a) => a.message);

  const opportunities = alerts
    .filter((a) => a.severity === "low" || a.severity === "medium")
    .map((a) => a.message);

  const headline = `Good morning — here is your SmartSend Executive Briefing for ${companyRow?.name ?? "your company"}.`;

  return {
    companyId: roofingCompanyId,
    companyName: companyRow?.name ?? undefined,
    date: dateStr,
    health,
    alerts,
    recommendations: recs,
    winsProblems,
    cashFlow,
    headline,
    highlights,
    risks,
    opportunities,
  };
}

// ---------------------------------------------------------------------------
// INTERNAL HELPERS
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function roundOneDecimal(v: number): number {
  return Math.round(v * 10) / 10;
}

function prettyCategory(key: HealthCategoryKey): string {
  switch (key) {
    case "sales":
      return "Sales Performance";
    case "production":
      return "Production Timeliness";
    case "finances":
      return "Financial Health";
    case "reputation":
      return "Customer Reputation";
    case "staffing":
      return "Staffing & Capacity";
    default:
      return key.charAt(0).toUpperCase() + key.slice(1);
  }
}













