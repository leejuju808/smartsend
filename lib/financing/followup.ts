/**
 * Auto Follow-Up System for Financing Declines
 * 
 * When a financing application is denied, automatically:
 * 1. Send follow-up email to homeowner with alternative options
 * 2. Alert sales rep with suggestions
 * 3. Suggest Plan B options (smaller repair, partial financing)
 */

import { createClient } from "@/lib/supabase/server";

export interface FinancingFollowUpOptions {
  applicationId: string;
  customerEmail?: string;
  customerName?: string;
  salesRepId?: string;
  jobId?: string;
  deniedReason?: string;
}

/**
 * Send follow-up email to homeowner after financing denial
 */
export async function sendFinancingDenialFollowUp(
  options: FinancingFollowUpOptions
): Promise<void> {
  const supabase = createClient();

  // Get application details
  const { data: application } = await supabase
    .from("financing_applications")
    .select("*")
    .eq("id", options.applicationId)
    .single();

  if (!application) {
    throw new Error("Application not found");
  }

  // Get alternative financing options (lower amount, different terms)
  const alternativeAmount = application.amount_requested * 0.7; // 70% of original
  const alternativeOptions = [
    {
      name: "Partial Financing",
      amount: alternativeAmount,
      description: "Finance 70% of the project cost",
    },
    {
      name: "Smaller Repair First",
      amount: application.amount_requested * 0.4,
      description: "Start with essential repairs, finance the rest later",
    },
  ];

  // Create follow-up message
  const followUpMessage = `
Hi ${options.customerName || "there"},

We found some alternative financing options that may work better for your budget:

${alternativeOptions
  .map(
    (opt) => `
• ${opt.name}: ${opt.description}
  Estimated monthly payment: $${(opt.amount / 12).toFixed(2)}/month (12 months, 0% APR)
`
  )
  .join("")}

Would you like to explore these options? We're here to help make this work for you.

Best regards,
Your Roofing Team
  `.trim();

  // Log the follow-up event
  await supabase.from("financing_events").insert({
    application_id: options.applicationId,
    event_type: "follow_up_sent",
    message: "Follow-up email sent with alternative financing options",
    event_data: {
      alternativeOptions,
      customerEmail: options.customerEmail,
    },
  });

  // In production, send actual email here
  // For now, we just log it
  console.log("Follow-up email would be sent:", {
    to: options.customerEmail,
    subject: "Alternative Financing Options for Your Roof Project",
    body: followUpMessage,
  });
}

/**
 * Alert sales rep about financing denial with suggestions
 */
export async function alertSalesRepAboutDenial(
  options: FinancingFollowUpOptions
): Promise<void> {
  const supabase = createClient();

  // Get application and job details
  const { data: application } = await supabase
    .from("financing_applications")
    .select("*, jobs(*)")
    .eq("id", options.applicationId)
    .single();

  if (!application) {
    throw new Error("Application not found");
  }

  const suggestions = [
    "Suggest partial financing (70% of project cost)",
    "Offer to break project into phases",
    "Recommend starting with essential repairs only",
    "Consider cash discount if customer can pay upfront",
    "Check if customer has home equity line of credit option",
  ];

  // Create notification for sales rep
  const notification = {
    type: "financing_denial",
    title: "Financing Application Denied",
    message: `Customer ${options.customerName || "application"} was denied financing.`,
    suggestions,
    applicationId: options.applicationId,
    jobId: options.jobId,
    customerName: options.customerName,
  };

  // In production, create a notification or task for the sales rep
  console.log("Sales rep notification:", notification);

  // Log the event
  await supabase.from("financing_events").insert({
    application_id: options.applicationId,
    event_type: "follow_up_sent",
    message: "Sales rep alerted about financing denial",
    event_data: {
      suggestions,
      salesRepId: options.salesRepId,
    },
    triggered_by: options.salesRepId || null,
  });
}

/**
 * Process financing denial and trigger follow-ups
 */
export async function processFinancingDenial(
  applicationId: string
): Promise<void> {
  const supabase = createClient();

  // Get application with related data
  const { data: application } = await supabase
    .from("financing_applications")
    .select(
      `
      *,
      jobs(id, team_id, company_id),
      customers(id, name, email, phone)
      `
    )
    .eq("id", applicationId)
    .single();

  if (!application) {
    throw new Error("Application not found");
  }

  const customerName =
    application.customer_name ||
    application.customers?.name ||
    "Customer";
  const customerEmail =
    application.customer_email ||
    application.customers?.email ||
    undefined;

  // Send follow-up to homeowner
  if (customerEmail) {
    await sendFinancingDenialFollowUp({
      applicationId,
      customerEmail,
      customerName,
      jobId: application.job_id || undefined,
    });
  }

  // Alert sales rep (if we can determine who it is)
  // In production, you'd look up the sales rep from the job/thread
  await alertSalesRepAboutDenial({
    applicationId,
    customerName,
    jobId: application.job_id || undefined,
  });
}





















