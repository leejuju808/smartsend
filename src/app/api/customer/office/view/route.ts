// Block 243000 — SmartSend Roofing CX Hub
// GET /api/customer/office/view
// Office/Manager view of customer portal activity

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id");
    const job_id = searchParams.get("job_id");
    const homeowner_id = searchParams.get("homeowner_id");

    if (!company_id && !job_id && !homeowner_id) {
      return NextResponse.json(
        { error: "company_id, job_id, or homeowner_id is required" },
        { status: 400 }
      );
    }

    // Build query conditions
    let jobIds: string[] = [];
    
    if (job_id) {
      jobIds = [job_id];
    } else if (homeowner_id) {
      const { data: portalAccess } = await supabase
        .from("customer_portal_access")
        .select("job_id")
        .eq("homeowner_id", homeowner_id)
        .eq("is_active", true);
      jobIds = portalAccess?.map((pa) => pa.job_id) || [];
    } else if (company_id) {
      // Get all jobs for company
      const { data: companyJobs } = await supabase
        .from("roofing_jobs")
        .select("id")
        .eq("company_id", company_id);
      jobIds = companyJobs?.map((j) => j.id) || [];
    }

    if (jobIds.length === 0) {
      return NextResponse.json({
        ok: true,
        customers: [],
      });
    }

    // Get all portal access records
    const { data: portalAccess } = await supabase
      .from("customer_portal_access")
      .select("*, homeowner:homeowners(*)")
      .in("job_id", jobIds)
      .eq("is_active", true);

    // For each customer, get comprehensive activity data
    const customers = await Promise.all(
      (portalAccess || []).map(async (access) => {
        const jobId = access.job_id;
        const homeownerId = access.homeowner_id;

        // Get job
        const { data: job } = await supabase
          .from("roofing_jobs")
          .select("*")
          .eq("id", jobId)
          .single();

        if (!job) {
          const { data: altJob } = await supabase
            .from("jobs")
            .select("*")
            .eq("id", jobId)
            .single();
          if (!altJob) return null;
        }

        // Get message history
        const { data: messages } = await supabase
          .from("customer_messages")
          .select("*, user:user_id(*)")
          .eq("job_id", jobId)
          .order("created_at", { ascending: false })
          .limit(50);

        // Get portal activity (logins)
        const loginCount = 1; // Would track in a separate table
        const lastLogin = access.last_login;

        // Get service requests
        const { data: serviceRequests } = await supabase
          .from("service_requests")
          .select("*")
          .eq("job_id", jobId)
          .eq("homeowner_id", homeownerId)
          .order("created_at", { ascending: false });

        // Get unread messages from customer
        const { data: unreadMessages } = await supabase
          .from("customer_messages")
          .select("id")
          .eq("job_id", jobId)
          .eq("sender_type", "homeowner")
          .is("read_at", null);

        // Get unresolved service issues
        const unresolvedServiceRequests = serviceRequests?.filter(
          (sr) => sr.status !== "resolved" && sr.status !== "closed"
        ) || [];

        // Analyze customer sentiment from messages
        let sentiment = "neutral";
        let sentimentScore = 0.5;
        if (messages && messages.length > 0) {
          const customerMessages = messages.filter((m) => m.sender_type === "homeowner");
          if (customerMessages.length > 0) {
            // Simple sentiment analysis
            const lastMessage = customerMessages[0].message.toLowerCase();
            if (lastMessage.match(/(upset|angry|frustrated|disappointed|terrible|awful|horrible|worst|bad|problem|issue|complaint)/)) {
              sentiment = "negative";
              sentimentScore = 0.2;
            } else if (lastMessage.match(/(happy|great|excellent|amazing|wonderful|love|thank|appreciate|perfect|fantastic)/)) {
              sentiment = "positive";
              sentimentScore = 0.8;
            }
          }
        }

        // Get payment status
        const { data: payments } = await supabase
          .from("payments")
          .select("amount, status")
          .eq("job_id", jobId)
          .eq("status", "completed");

        const totalPaid = payments?.reduce((sum, p) => sum + (parseFloat(p.amount || 0)), 0) || 0;

        const { data: invoices } = await supabase
          .from("invoices")
          .select("amount, amount_due")
          .eq("job_id", jobId);

        const totalDue = invoices?.reduce((sum, inv) => sum + (parseFloat(inv.amount_due || inv.amount || 0)), 0) || 0;
        const paymentProgress = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;

        return {
          homeowner: access.homeowner,
          job: {
            id: jobId,
            ...job,
          },
          portalActivity: {
            loginCount,
            lastLogin,
            accessToken: access.access_token,
            createdAt: access.created_at,
          },
          messageHistory: messages || [],
          unreadMessageCount: unreadMessages?.length || 0,
          serviceRequests: serviceRequests || [],
          unresolvedServiceCount: unresolvedServiceRequests.length,
          sentiment: {
            value: sentiment,
            score: sentimentScore,
          },
          paymentStatus: {
            totalPaid,
            totalDue,
            remaining: totalDue - totalPaid,
            progress: paymentProgress,
          },
        };
      })
    );

    // Filter out nulls
    const validCustomers = customers.filter((c) => c !== null);

    return NextResponse.json({
      ok: true,
      customers: validCustomers,
      summary: {
        totalCustomers: validCustomers.length,
        totalUnreadMessages: validCustomers.reduce((sum, c) => sum + (c.unreadMessageCount || 0), 0),
        totalUnresolvedServiceRequests: validCustomers.reduce((sum, c) => sum + (c.unresolvedServiceCount || 0), 0),
        negativeSentimentCount: validCustomers.filter((c) => c.sentiment.value === "negative").length,
      },
    });
  } catch (error: any) {
    console.error("Error in office view API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























