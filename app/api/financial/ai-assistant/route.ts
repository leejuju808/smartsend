import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/financial/ai-assistant
 * AI Financial Assistant - answers financial questions
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { company_id, question } = body;

    if (!company_id || !question) {
      return NextResponse.json(
        { error: "company_id and question are required" },
        { status: 400 }
      );
    }

    // Get financial data to answer the question
    const financialData: any = {};

    // Get job financials
    const { data: jobFinancials } = await supabase
      .from("job_financials")
      .select("*")
      .eq("company_id", company_id)
      .order("updated_at", { ascending: false })
      .limit(50);

    financialData.jobs = jobFinancials || [];

    // Get cost overruns
    const { data: overruns } = await supabase
      .from("cost_overruns")
      .select("*")
      .eq("company_id", company_id)
      .eq("acknowledged", false)
      .order("created_at", { ascending: false });

    financialData.overruns = overruns || [];

    // Get cashflow forecast
    const { data: forecast } = await supabase.rpc("forecast_cashflow", {
      p_company_id: company_id,
      p_start_date: new Date().toISOString().split("T")[0],
      p_end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    });

    financialData.forecast = forecast;

    // Get profit analytics
    const { data: crewProfit } = await supabase
      .from("profit_by_crew")
      .select("*")
      .order("avg_margin", { ascending: false });

    const { data: jobTypeProfit } = await supabase
      .from("profit_by_job_type")
      .select("*")
      .order("avg_margin", { ascending: false });

    financialData.analytics = {
      crew: crewProfit || [],
      job_type: jobTypeProfit || [],
    };

    // Simple question answering (can be enhanced with AI/LLM)
    let answer = "";
    const lowerQuestion = question.toLowerCase();

    if (lowerQuestion.includes("losing money") || lowerQuestion.includes("unprofitable")) {
      const losingJobs = financialData.jobs.filter((j: any) => j.gross_profit < 0);
      answer = `You have ${losingJobs.length} job${losingJobs.length !== 1 ? "s" : ""} that ${losingJobs.length === 1 ? "is" : "are"} losing money. `;
      if (losingJobs.length > 0) {
        answer += `The most significant loss is $${Math.abs(Math.min(...losingJobs.map((j: any) => j.gross_profit))).toLocaleString()}. `;
      }
      answer += "Review these jobs immediately to identify cost overruns or pricing issues.";
    } else if (lowerQuestion.includes("cost overrun") || lowerQuestion.includes("overrun")) {
      answer = `You have ${financialData.overruns.length} unacknowledged cost overrun${financialData.overruns.length !== 1 ? "s" : ""}. `;
      if (financialData.overruns.length > 0) {
        const totalVariance = financialData.overruns.reduce((sum: number, o: any) => sum + o.variance, 0);
        answer += `Total variance: $${totalVariance.toLocaleString()}. `;
      }
      answer += "Review and acknowledge these overruns to track cost management.";
    } else if (lowerQuestion.includes("cashflow") || lowerQuestion.includes("cash flow")) {
      if (financialData.forecast) {
        const isTight = financialData.forecast.cashflow_tight;
        answer = `Your cashflow forecast shows ${isTight ? "a tight" : "healthy"} cashflow situation. `;
        answer += `Inflows: $${financialData.forecast.inflows?.toLocaleString() || 0}, `;
        answer += `Outflows: $${financialData.forecast.outflows?.toLocaleString() || 0}, `;
        answer += `Net: $${financialData.forecast.net?.toLocaleString() || 0}. `;
        if (isTight) {
          answer += "You have material POs due before receivables arrive. Consider adjusting payment terms or scheduling.";
        }
      } else {
        answer = "Cashflow forecast data is not available. Please check your cashflow events.";
      }
    } else if (lowerQuestion.includes("crew") && (lowerQuestion.includes("profit") || lowerQuestion.includes("margin"))) {
      if (financialData.analytics.crew && financialData.analytics.crew.length > 0) {
        const worstCrew = financialData.analytics.crew[financialData.analytics.crew.length - 1];
        const bestCrew = financialData.analytics.crew[0];
        answer = `Your best performing crew is ${bestCrew.crew_name} with ${bestCrew.avg_margin.toFixed(1)}% average margin. `;
        answer += `Your lowest performing crew is ${worstCrew.crew_name} with ${worstCrew.avg_margin.toFixed(1)}% average margin. `;
        answer += "Review crew performance to identify training or resource allocation opportunities.";
      } else {
        answer = "Crew profit data is not available yet.";
      }
    } else if (lowerQuestion.includes("job type") && (lowerQuestion.includes("profit") || lowerQuestion.includes("margin"))) {
      if (financialData.analytics.job_type && financialData.analytics.job_type.length > 0) {
        const bestType = financialData.analytics.job_type[0];
        answer = `Your most profitable job type is ${bestType.job_type.replace(/_/g, " ")} with ${bestType.avg_margin.toFixed(1)}% average margin. `;
        answer += `Total profit: $${bestType.total_profit.toLocaleString()}. `;
        answer += "Focus on winning more of these high-margin job types.";
      } else {
        answer = "Job type profit data is not available yet.";
      }
    } else if (lowerQuestion.includes("margin") || lowerQuestion.includes("profitability")) {
      const avgMargin = financialData.jobs.length > 0
        ? financialData.jobs.reduce((sum: number, j: any) => sum + (j.margin || 0), 0) / financialData.jobs.length
        : 0;
      const lowMarginJobs = financialData.jobs.filter((j: any) => j.margin < 25 && j.margin > 0);
      answer = `Your average job margin is ${avgMargin.toFixed(1)}%. `;
      answer += `You have ${lowMarginJobs.length} job${lowMarginJobs.length !== 1 ? "s" : ""} with margins below 25%. `;
      answer += "Review pricing strategies and cost management to improve margins.";
    } else {
      answer = "I can help you understand your financial data. Try asking about:\n";
      answer += "- Which jobs are losing money\n";
      answer += "- Cost overruns\n";
      answer += "- Cashflow forecast\n";
      answer += "- Crew profitability\n";
      answer += "- Job type profitability\n";
      answer += "- Overall margins";
    }

    return NextResponse.json({
      question,
      answer,
      data: financialData,
    });
  } catch (error: any) {
    console.error("AI Financial Assistant error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















