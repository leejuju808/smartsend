import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Generate invoice number for a team
 */
export async function generate_invoice_number(
  supabase: SupabaseClient,
  teamId: string
): Promise<string> {
  // Get the latest invoice number for this team
  const { data: latestInvoice } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let nextNum = 1;
  if (latestInvoice?.invoice_number) {
    // Extract number from format INV-YYYY-NNNN
    const match = latestInvoice.invoice_number.match(/-(\d{4})$/);
    if (match) {
      nextNum = parseInt(match[1]) + 1;
    }
  }

  const year = new Date().getFullYear();
  return `INV-${year}-${String(nextNum).padStart(4, "0")}`;
}

/**
 * Calculate job profit
 */
export async function calculateJobProfit(
  supabase: SupabaseClient,
  jobId: string
): Promise<{
  revenue: number;
  total_cost: number;
  profit: number;
  profit_margin_percent: number;
}> {
  // Get job revenue (contract value)
  const { data: job } = await supabase
    .from("jobs")
    .select("contract_value")
    .eq("id", jobId)
    .single();

  const revenue = parseFloat(job?.contract_value || "0");

  // Get job costs
  const { data: costs } = await supabase
    .from("job_costs")
    .select("total_cost")
    .eq("job_id", jobId)
    .single();

  const totalCost = parseFloat(costs?.total_cost || "0");

  const profit = revenue - totalCost;
  const profitMarginPercent =
    revenue > 0 ? (profit / revenue) * 100 : 0;

  return {
    revenue,
    total_cost: totalCost,
    profit,
    profit_margin_percent: Math.round(profitMarginPercent * 100) / 100,
  };
}

/**
 * Auto-generate invoice based on job stage
 */
export async function autoGenerateInvoice(
  supabase: SupabaseClient,
  jobId: string,
  invoiceType: "deposit" | "progress" | "final" | "change_order",
  options?: {
    amount?: number;
    description?: string;
    line_items?: Array<{
      description: string;
      quantity: number;
      unit_price: number;
      amount: number;
    }>;
  }
): Promise<string | null> {
  // Get job details
  const { data: job } = await supabase
    .from("jobs")
    .select(`
      id,
      team_id,
      contract_value,
      lead_id,
      leads (
        id,
        customer_id
      )
    `)
    .eq("id", jobId)
    .single();

  if (!job) {
    throw new Error("Job not found");
  }

  const teamId = job.team_id;
  const customerId = (job.leads as any)?.customer_id || null;

  // Determine amount based on type if not provided
  let amount = options?.amount;
  if (!amount) {
    const contractValue = parseFloat(job.contract_value || "0");
    switch (invoiceType) {
      case "deposit":
        amount = contractValue * 0.3; // 30% deposit
        break;
      case "progress":
        amount = contractValue * 0.4; // 40% progress
        break;
      case "final":
        // Calculate remaining after other invoices
        const { data: existingInvoices } = await supabase
          .from("invoices")
          .select("total_amount, paid_amount")
          .eq("job_id", jobId)
          .in("invoice_type", ["deposit", "progress"]);

        const invoicedAmount =
          existingInvoices?.reduce(
            (sum, inv) => sum + parseFloat(inv.total_amount || "0"),
            0
          ) || 0;
        amount = Math.max(0, contractValue - invoicedAmount);
        break;
      default:
        amount = 0;
    }
  }

  // Generate invoice number
  const invoiceNumber = await generate_invoice_number(supabase, teamId);

  // Calculate due date (30 days from now)
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  // Create invoice
  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      team_id: teamId,
      job_id: jobId,
      customer_id: customerId,
      invoice_number: invoiceNumber,
      invoice_type: invoiceType,
      amount: amount,
      tax_amount: 0,
      total_amount: amount,
      due_date: dueDate.toISOString().split("T")[0],
      description:
        options?.description ||
        `${invoiceType.charAt(0).toUpperCase() + invoiceType.slice(1)} Invoice`,
      line_items: options?.line_items || [],
      status: "unpaid",
    })
    .select()
    .single();

  if (error) {
    console.error("Error auto-generating invoice:", error);
    return null;
  }

  return invoice.id;
}

/**
 * Get AR summary for a team
 */
export async function getARSummary(
  supabase: SupabaseClient,
  teamId: string
): Promise<{
  total_ar: number;
  overdue_amount: number;
  due_this_week: number;
  paid_this_month: number;
  unpaid_count: number;
  overdue_count: number;
}> {
  const { data: summary } = await supabase
    .from("ar_summary")
    .select("*")
    .eq("team_id", teamId)
    .single();

  return {
    total_ar: parseFloat(summary?.total_ar || "0"),
    overdue_amount: parseFloat(summary?.overdue_amount || "0"),
    due_this_week: parseFloat(summary?.due_this_week || "0"),
    paid_this_month: parseFloat(summary?.paid_this_month || "0"),
    unpaid_count: parseInt(summary?.unpaid_count || "0"),
    overdue_count: parseInt(summary?.overdue_count || "0"),
  };
}
