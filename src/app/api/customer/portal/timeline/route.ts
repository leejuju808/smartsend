// Block 227000 — SmartSend Roofing Customer Portal
// GET /api/customer/portal/timeline?job_id=...
// Returns live job timeline (public access via token)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const token = searchParams.get("token");
    const jobId = searchParams.get("job_id");

    if (!token) {
      return NextResponse.json(
        { error: "Token is required. Use ?token=...&job_id=..." },
        { status: 400 }
      );
    }

    // Validate token
    const { data: access, error: accessError } = await supabase
      .from("customer_portal_access")
      .select("job_id")
      .eq("access_token", token)
      .eq("is_active", true)
      .single();

    if (accessError || !access) {
      return NextResponse.json(
        { error: "Invalid or expired portal access token" },
        { status: 401 }
      );
    }

    const validJobId = jobId || access.job_id;

    // Get notifications
    const { data: notifications } = await supabase
      .from("customer_notifications")
      .select("*")
      .eq("job_id", validJobId)
      .order("created_at", { ascending: false });

    // Get contract events
    let contractEvents: any[] = [];
    try {
      const { data: jobLink } = await supabase
        .from("estimates_job_links")
        .select("contract:estimates_contracts(*)")
        .eq("job_id", validJobId)
        .single();

      if (jobLink?.contract) {
        const contract = jobLink.contract;
        if (contract.status === "signed" && contract.signature_date) {
          contractEvents.push({
            event_type: "contract_signed",
            title: "Contract Signed",
            body: "Your contract has been signed and approved.",
            created_at: contract.signature_date,
            metadata: { contract_id: contract.id },
          });
        }
      }
    } catch (e) {
      // Contract may not exist
    }

    // Get invoice/payment events
    let paymentEvents: any[] = [];
    try {
      const { data: invoices } = await supabase
        .from("job_invoices")
        .select("*")
        .eq("job_id", validJobId)
        .order("created_at", { ascending: false });

      if (invoices) {
        invoices.forEach((inv: any) => {
          if (inv.status === "paid") {
            paymentEvents.push({
              event_type: inv.type === "deposit" ? "deposit_paid" : "progress_payment_paid",
              title: `${inv.type === "deposit" ? "Deposit" : "Payment"} Paid`,
              body: `$${inv.amount} ${inv.type} payment received.`,
              created_at: inv.updated_at,
              metadata: { invoice_id: inv.id },
            });
          }
        });
      }
    } catch (e) {
      // Invoices may not exist
    }

    // Get material delivery events
    let materialEvents: any[] = [];
    try {
      const { data: supplierOrders } = await supabase
        .from("supplier_orders")
        .select("*")
        .eq("job_id", validJobId)
        .eq("status", "delivered")
        .order("updated_at", { ascending: false });

      if (supplierOrders) {
        supplierOrders.forEach((order: any) => {
          materialEvents.push({
            event_type: "materials_delivered",
            title: "Materials Delivered",
            body: "Your roofing materials have been delivered.",
            created_at: order.updated_at,
            metadata: { order_id: order.id },
          });
        });
      }
    } catch (e) {
      // Supplier orders may not exist
    }

    // Get crew log events (sanitized for customer)
    let crewEvents: any[] = [];
    try {
      const { data: dailyLogs } = await supabase
        .from("daily_logs")
        .select("id, job_id, log_date, status, created_at")
        .eq("job_id", validJobId)
        .order("log_date", { ascending: false })
        .limit(10);

      if (dailyLogs) {
        dailyLogs.forEach((log: any) => {
          if (log.status === "complete") {
            crewEvents.push({
              event_type: "crew_finished",
              title: "Crew Completed Work",
              body: `Work completed on ${new Date(log.log_date).toLocaleDateString()}.`,
              created_at: log.created_at,
              metadata: { log_id: log.id },
            });
          } else if (log.status === "in_progress") {
            crewEvents.push({
              event_type: "crew_started",
              title: "Crew Started Work",
              body: `Work began on ${new Date(log.log_date).toLocaleDateString()}.`,
              created_at: log.created_at,
              metadata: { log_id: log.id },
            });
          }
        });
      }
    } catch (e) {
      // Daily logs may not exist
    }

    // Combine all events and sort by date
    const allEvents = [
      ...(notifications || []),
      ...contractEvents,
      ...paymentEvents,
      ...materialEvents,
      ...crewEvents,
    ].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA; // Most recent first
    });

    return NextResponse.json({
      ok: true,
      timeline: allEvents,
    });
  } catch (error: any) {
    console.error("Error in timeline API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























