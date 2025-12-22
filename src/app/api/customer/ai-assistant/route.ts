// Block 243000 — SmartSend Roofing CX Hub
// POST /api/customer/ai-assistant
// AI Assistant for Homeowners - answers questions about their job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { homeowner_id, job_id, question } = body;

    if (!homeowner_id || !job_id || !question) {
      return NextResponse.json(
        { error: "homeowner_id, job_id, and question are required" },
        { status: 400 }
      );
    }

    // Get job data
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (!job) {
      const { data: altJob } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", job_id)
        .single();
      if (!altJob) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }
    }

    // Get homeowner
    const { data: homeowner } = await supabase
      .from("homeowners")
      .select("*")
      .eq("id", homeowner_id)
      .single();

    // Get payment info
    const { data: payments } = await supabase
      .from("payments")
      .select("amount, status")
      .eq("job_id", job_id)
      .eq("status", "completed");

    const totalPaid = payments?.reduce((sum, p) => sum + (parseFloat(p.amount || 0)), 0) || 0;

    // Get invoices
    const { data: invoices } = await supabase
      .from("invoices")
      .select("amount, amount_due, due_date, status")
      .eq("job_id", job_id)
      .order("due_date", { ascending: true });

    const totalDue = invoices?.reduce((sum, inv) => sum + (parseFloat(inv.amount_due || inv.amount || 0)), 0) || 0;
    const remainingBalance = totalDue - totalPaid;

    // Get schedule
    const { data: schedule } = await supabase
      .from("job_production_slots")
      .select("start_date, end_date, crew:crews(name)")
      .eq("job_id", job_id)
      .order("start_date", { ascending: true })
      .limit(1)
      .single();

    // Get contract
    let contract = null;
    try {
      const { data: jobLink } = await supabase
        .from("estimates_job_links")
        .select("contract:estimates_contracts(*)")
        .eq("job_id", job_id)
        .single();
      contract = jobLink?.contract;
    } catch (e) {
      // Contract may not exist
    }

    // Get recent notifications
    const { data: recentNotifications } = await supabase
      .from("customer_notifications")
      .select("title, body, created_at")
      .eq("job_id", job_id)
      .eq("homeowner_id", homeowner_id)
      .order("created_at", { ascending: false })
      .limit(5);

    // Build context for AI
    const jobContext = {
      status: job?.status || job?.stage || "unknown",
      address: job?.address || "Not specified",
      contractValue: job?.contract_value || 0,
      totalPaid,
      remainingBalance,
      scheduledDate: schedule?.start_date || null,
      crewName: schedule?.crew?.name || null,
      contractSigned: contract?.status === "signed",
      recentUpdates: recentNotifications?.map(n => `${n.title}: ${n.body || ""}`) || [],
    };

    // If OpenAI is not available, return a simple response
    if (!openai) {
      // Simple keyword-based responses
      const lowerQuestion = question.toLowerCase();
      
      if (lowerQuestion.includes("when") && lowerQuestion.includes("crew")) {
        return NextResponse.json({
          ok: true,
          answer: jobContext.scheduledDate
            ? `Your crew is scheduled to start on ${new Date(jobContext.scheduledDate).toLocaleDateString()}.`
            : "Your crew schedule is being finalized. We'll notify you as soon as it's confirmed.",
        });
      }
      
      if (lowerQuestion.includes("balance") || lowerQuestion.includes("remaining") || lowerQuestion.includes("owe")) {
        return NextResponse.json({
          ok: true,
          answer: `Your remaining balance is $${remainingBalance.toFixed(2)}. You've paid $${totalPaid.toFixed(2)} of $${totalDue.toFixed(2)}.`,
        });
      }
      
      if (lowerQuestion.includes("contract")) {
        return NextResponse.json({
          ok: true,
          answer: jobContext.contractSigned
            ? "Your contract has been signed. You can view it in the Documents tab."
            : "Your contract is available in the Documents tab for review.",
        });
      }
      
      if (lowerQuestion.includes("stage") || lowerQuestion.includes("status") || lowerQuestion.includes("progress")) {
        return NextResponse.json({
          ok: true,
          answer: `Your job is currently ${jobContext.status}. ${jobContext.recentUpdates.length > 0 ? `Recent update: ${jobContext.recentUpdates[0]}` : ""}`,
        });
      }
      
      return NextResponse.json({
        ok: true,
        answer: "I can help you with questions about your crew schedule, payment balance, contract, and job status. What would you like to know?",
      });
    }

    // Use OpenAI for intelligent responses
    const systemPrompt = `You are a helpful AI assistant for a roofing company customer portal. You help homeowners get answers about their roofing project.

Current Job Information:
- Status: ${jobContext.status}
- Address: ${jobContext.address}
- Contract Value: $${jobContext.contractValue}
- Total Paid: $${totalPaid.toFixed(2)}
- Remaining Balance: $${remainingBalance.toFixed(2)}
- Scheduled Start Date: ${jobContext.scheduledDate ? new Date(jobContext.scheduledDate).toLocaleDateString() : "Not yet scheduled"}
- Crew: ${jobContext.crewName || "Not assigned"}
- Contract Status: ${jobContext.contractSigned ? "Signed" : "Not signed"}
${jobContext.recentUpdates.length > 0 ? `\nRecent Updates:\n${jobContext.recentUpdates.join("\n")}` : ""}

You can answer questions about:
- When the crew will arrive (scheduled dates)
- Payment balance and remaining amount
- Contract status and access
- Job progress and current stage
- Service requests and warranty claims
- Photo uploads

Be friendly, concise, and helpful. If you don't have specific information, direct them to the appropriate tab in the portal or suggest they contact the office.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const answer = completion.choices[0]?.message?.content || "I'm here to help! Could you rephrase your question?";

    return NextResponse.json({
      ok: true,
      answer,
      context: jobContext,
    });
  } catch (error: any) {
    console.error("Error in AI assistant API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























