// supabase/functions/send_executive_report/index.ts
// Block 26800 — SmartSend Roofing Executive Summary Report v1
// Runs every Monday at 6 AM via CRON
// Generates weekly executive summary email for roofing business owners

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const fromEmail = Deno.env.get("SMARTSEND_FROM_EMAIL") || "SmartSend <no-reply@smartsend.ai>";

type WorkspaceRow = {
  id: string;
  owner_id: string;
};

type ExecutiveSummaryRow = {
  workspace_id: string;
  net_cashflow_30d: number;
  incoming_cashflow_30d: number;
  outgoing_cashflow_30d: number;
  total_projected_profit: number;
  total_projected_revenue: number;
  total_ar: number;
  overdue_ar: number;
  pending_renewals: number;
};

type DealPriorityRow = {
  job_id: string;
  workspace_id: string;
  homeowner_name: string | null;
  address: string | null;
  status: string | null;
  estimated_value: number | null;
  win_probability: number | null;
  expected_revenue: number | null;
  expected_profit: number | null;
  follow_up_priority: string | null;
};

type JobProfitRow = {
  job_id: string;
  workspace_id: string;
  job_name: string;
  status: string;
  estimated_revenue: number;
  final_revenue: number;
  gross_profit: number;
  margin: number;
};

type InvoiceBalanceRow = {
  invoice_id: string;
  job_id: string | null;
  workspace_id: string;
  payer_name: string | null;
  payer_email: string | null;
  invoice_number: string | null;
  balance_due: number;
  due_date: string | null;
  status: string;
};

async function getWorkspacesWithOwners(): Promise<
  (WorkspaceRow & { owner_email: string | null })[]
> {
  // Get all active workspaces
  const { data: workspaces, error: workspacesError } = await supabase
    .from("workspaces")
    .select("id, owner_id")
    .eq("is_active", true);

  if (workspacesError || !workspaces) {
    console.error("Failed to fetch workspaces", workspacesError);
    return [];
  }

  // Get owner emails
  const workspacesWithEmails = await Promise.all(
    workspaces.map(async (ws) => {
      let ownerEmail: string | null = null;

      // Try to get email from company_settings first
      const { data: companySettings } = await supabase
        .from("company_settings")
        .select("company_email")
        .eq("workspace_id", ws.id)
        .maybeSingle();

      if (companySettings?.company_email) {
        ownerEmail = companySettings.company_email;
      } else {
        // Fallback: get email from auth.users
        try {
          const { data: { user } } = await supabase.auth.admin.getUserById(ws.owner_id);
          ownerEmail = user?.email || null;
        } catch (e) {
          console.error(`Failed to get email for owner ${ws.owner_id}:`, e);
        }
      }

      return {
        ...ws,
        owner_email: ownerEmail,
      };
    })
  );

  return workspacesWithEmails.filter((ws) => ws.owner_email !== null);
}

async function getExecutiveSummary(workspaceId: string): Promise<ExecutiveSummaryRow | null> {
  const { data, error } = await supabase
    .from("roofing_executive_summary")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    console.error(`Failed to get executive summary for workspace ${workspaceId}:`, error);
    return null;
  }

  return data;
}

async function getTopDeals(workspaceId: string, limit: number = 5): Promise<DealPriorityRow[]> {
  const { data, error } = await supabase
    .from("roofing_deal_priority")
    .select("*")
    .eq("workspace_id", workspaceId)
    .limit(limit);

  if (error) {
    console.error(`Failed to get top deals for workspace ${workspaceId}:`, error);
    return [];
  }

  return data || [];
}

async function getAtRiskJobs(workspaceId: string, limit: number = 5): Promise<JobProfitRow[]> {
  const { data, error } = await supabase
    .from("roofing_owner_job_profit_summary")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("margin", { ascending: true })
    .limit(limit);

  if (error) {
    console.error(`Failed to get at-risk jobs for workspace ${workspaceId}:`, error);
    return [];
  }

  return data || [];
}

async function getOverdueInvoices(workspaceId: string): Promise<InvoiceBalanceRow[]> {
  const { data, error } = await supabase
    .from("roofing_invoice_balances")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "overdue")
    .gt("balance_due", 0);

  if (error) {
    console.error(`Failed to get overdue invoices for workspace ${workspaceId}:`, error);
    return [];
  }

  return data || [];
}

async function generateAIStateOfBusiness(
  summary: ExecutiveSummaryRow,
  topDeals: DealPriorityRow[],
  atRisk: JobProfitRow[],
  overdue: InvoiceBalanceRow[]
): Promise<string> {
  if (!openaiApiKey) {
    console.warn("OPENAI_API_KEY not set — using fallback summary");
    return generateFallbackSummary(summary, topDeals, atRisk, overdue);
  }

  try {
    const prompt = `Write a one-paragraph executive summary for a roofing business owner.

Include:
- Cashflow health
- Profitability outlook
- Sales opportunities
- Collection risks
- Operational focus for the week

Use the following data:
${JSON.stringify(summary, null, 2)}

Top deals: ${JSON.stringify(topDeals.slice(0, 5), null, 2)}
At risk jobs: ${JSON.stringify(atRisk.slice(0, 5), null, 2)}
Overdue invoices: ${JSON.stringify(overdue.slice(0, 5), null, 2)}

Write in a clear, actionable tone. Be specific with numbers.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return generateFallbackSummary(summary, topDeals, atRisk, overdue);
    }

    const completion = await response.json();
    return completion.choices[0]?.message?.content || generateFallbackSummary(summary, topDeals, atRisk, overdue);
  } catch (e) {
    console.error("OpenAI error:", e);
    return generateFallbackSummary(summary, topDeals, atRisk, overdue);
  }
}

function generateFallbackSummary(
  summary: ExecutiveSummaryRow,
  topDeals: DealPriorityRow[],
  atRisk: JobProfitRow[],
  overdue: InvoiceBalanceRow[]
): string {
  const netCashflow = summary.net_cashflow_30d;
  const cashflowStatus = netCashflow > 0 ? "positive" : netCashflow < -10000 ? "critical" : "tight";
  
  const topDealCount = topDeals.length;
  const atRiskCount = atRisk.length;
  const overdueCount = overdue.length;

  let summaryText = `Your ${cashflowStatus === "positive" ? "strong" : cashflowStatus === "critical" ? "critical" : "tight"} cashflow position shows $${Math.abs(netCashflow).toLocaleString()} ${netCashflow >= 0 ? "incoming" : "outgoing"} over the next 30 days. `;
  
  if (topDealCount > 0) {
    summaryText += `You have ${topDealCount} high-probability deals in the pipeline worth $${topDeals.reduce((sum, d) => sum + (d.expected_revenue || 0), 0).toLocaleString()}. `;
  }
  
  if (atRiskCount > 0) {
    summaryText += `${atRiskCount} jobs are showing margin risk and need attention. `;
  }
  
  if (overdueCount > 0) {
    summaryText += `Collections are a priority with $${summary.overdue_ar.toLocaleString()} in overdue invoices from ${overdueCount} accounts. `;
  }
  
  summaryText += `Focus your team on following up with overdue accounts and protecting margins on at-risk jobs.`;

  return summaryText;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function buildEmailHtml(
  summary: ExecutiveSummaryRow,
  topDeals: DealPriorityRow[],
  atRisk: JobProfitRow[],
  overdue: InvoiceBalanceRow[],
  businessState: string
): string {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const netCashflowClass = summary.net_cashflow_30d >= 0 ? "color: #10b981;" : "color: #ef4444;";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SmartSend Weekly Executive Report</title>
</head>
<body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
  <div style="max-width: 700px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <h2 style="margin-bottom: 10px; color: #1a1a1a;">SmartSend Weekly Executive Report</h2>
    <p style="color: #666; margin-bottom: 30px; font-size: 14px;">
      Your weekly business health snapshot
    </p>

    <h3 style="color: #1a1a1a; margin-top: 30px; margin-bottom: 15px; font-size: 18px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Cashflow Summary (Next 30 Days)</h3>
    <div style="line-height: 1.8; font-size: 14px; margin-bottom: 20px;">
      <div>Incoming: <strong>${formatCurrency(summary.incoming_cashflow_30d)}</strong></div>
      <div>Outgoing: <strong>${formatCurrency(summary.outgoing_cashflow_30d)}</strong></div>
      <div style="margin-top: 10px; font-size: 16px;">
        <strong style="${netCashflowClass}">Net 30 Days: ${formatCurrency(summary.net_cashflow_30d)}</strong>
      </div>
    </div>

    <h3 style="color: #1a1a1a; margin-top: 30px; margin-bottom: 15px; font-size: 18px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Profit Summary</h3>
    <div style="line-height: 1.8; font-size: 14px; margin-bottom: 20px;">
      <div>Projected Revenue: <strong>${formatCurrency(summary.total_projected_revenue)}</strong></div>
      <div>Projected Profit: <strong style="color: #10b981;">${formatCurrency(summary.total_projected_profit)}</strong></div>
    </div>

    <h3 style="color: #1a1a1a; margin-top: 30px; margin-bottom: 15px; font-size: 18px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Collections</h3>
    <div style="line-height: 1.8; font-size: 14px; margin-bottom: 20px;">
      <div>Total AR: <strong>${formatCurrency(summary.total_ar)}</strong></div>
      <div>Overdue: <strong style="color: #ef4444;">${formatCurrency(summary.overdue_ar)}</strong></div>
      <div style="margin-top: 10px;">
        <strong>Accounts to contact: ${overdue.length}</strong>
      </div>
    </div>

    ${topDeals.length > 0 ? `
    <h3 style="color: #1a1a1a; margin-top: 30px; margin-bottom: 15px; font-size: 18px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Top Deals</h3>
    <div style="line-height: 1.8; font-size: 14px; margin-bottom: 20px;">
      ${topDeals.map((d) => {
        const jobName = d.homeowner_name || d.address || "Untitled Job";
        const winProb = d.win_probability || 0;
        const expectedRev = d.expected_revenue || 0;
        return `<div style="margin-bottom: 8px;">• <strong>${jobName}</strong> (${winProb}% win probability | ${formatCurrency(expectedRev)})</div>`;
      }).join("")}
    </div>
    ` : ""}

    ${atRisk.length > 0 ? `
    <h3 style="color: #1a1a1a; margin-top: 30px; margin-bottom: 15px; font-size: 18px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Jobs At Risk</h3>
    <div style="line-height: 1.8; font-size: 14px; margin-bottom: 20px;">
      ${atRisk.map((j) => {
        const margin = j.margin || 0;
        const marginColor = margin < 20 ? "#ef4444" : margin < 30 ? "#f59e0b" : "#10b981";
        return `<div style="margin-bottom: 8px;">• <strong>${j.job_name}</strong> (Margin: <span style="color: ${marginColor};">${margin.toFixed(1)}%</span>)</div>`;
      }).join("")}
    </div>
    ` : ""}

    ${summary.pending_renewals > 0 ? `
    <h3 style="color: #1a1a1a; margin-top: 30px; margin-bottom: 15px; font-size: 18px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Pending Renewals</h3>
    <div style="line-height: 1.8; font-size: 14px; margin-bottom: 20px;">
      <div><strong>${summary.pending_renewals}</strong> homes ready for re-inspection or re-roof cycle.</div>
    </div>
    ` : ""}

    <h3 style="color: #1a1a1a; margin-top: 30px; margin-bottom: 15px; font-size: 18px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">AI State of the Business</h3>
    <p style="line-height: 1.7; font-size: 14px; color: #333; background-color: #f9fafb; padding: 15px; border-radius: 6px; border-left: 4px solid #3b82f6;">
      ${businessState}
    </p>

    <p style="margin-top: 30px; color: #888; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px;">
      SmartSend is your virtual COO — tracking cashflow, profit, collections, and opportunities so you can focus on running your business.
    </p>
  </div>
</body>
</html>
  `;
}

async function sendEmailViaResend({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resendApiKey) {
    console.warn("RESEND_API_KEY not set — skipping email send");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Resend error:", errorText);
      return { ok: false, error: errorText };
    }

    return { ok: true };
  } catch (e) {
    console.error("Resend send error:", e);
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async () => {
  try {
    // 1) Get all active workspaces with owners
    const workspaces = await getWorkspacesWithOwners();

    if (workspaces.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No active workspaces found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let errors = 0;

    for (const workspace of workspaces) {
      const workspaceId = workspace.id;
      const ownerEmail = workspace.owner_email;

      if (!ownerEmail) {
        console.warn(`No email found for workspace ${workspaceId}, skipping`);
        continue;
      }

      // 2) Get executive summary data
      const summary = await getExecutiveSummary(workspaceId);

      if (!summary) {
        console.warn(`No summary data for workspace ${workspaceId}, skipping`);
        continue;
      }

      // 3) Get supporting data
      const topDeals = await getTopDeals(workspaceId, 5);
      const atRisk = await getAtRiskJobs(workspaceId, 5);
      const overdue = await getOverdueInvoices(workspaceId);

      // 4) Generate AI "State of Business" summary
      const businessState = await generateAIStateOfBusiness(summary, topDeals, atRisk, overdue);

      // 5) Build email HTML
      const html = buildEmailHtml(summary, topDeals, atRisk, overdue, businessState);

      // 6) Save to historical reports table
      const { error: insertError } = await supabase
        .from("roofing_executive_reports")
        .insert({
          workspace_id: workspaceId,
          html,
          summary_data: {
            summary,
            topDeals,
            atRisk,
            overdue,
            businessState,
          },
        });

      if (insertError) {
        console.error(`Failed to save report for workspace ${workspaceId}:`, insertError);
      }

      // 7) Send email via Resend
      const emailResult = await sendEmailViaResend({
        to: ownerEmail,
        subject: "Your SmartSend Weekly Executive Report",
        html,
      });

      if (emailResult.ok) {
        processed++;
        console.log(`Sent executive report to ${ownerEmail} for workspace ${workspaceId}`);
      } else {
        errors++;
        console.error(
          `Failed to send executive report to ${ownerEmail} for workspace ${workspaceId}:`,
          emailResult.error
        );
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed, errors }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send_executive_report error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



































