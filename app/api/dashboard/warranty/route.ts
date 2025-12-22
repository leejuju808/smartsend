// Block 32277 — SmartSend Roofing Warranty Tracker API
// GET /api/dashboard/warranty - Get warranty dashboard data

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
    const ninetyDaysStr = ninetyDaysFromNow.toISOString().split("T")[0];

    // Get active warranties
    const { data: activeWarranties, error: activeError } = await supabase
      .from("warranties")
      .select(`
        id,
        expiration_date,
        job:jobs(id, title),
        homeowner:leads(id, first_name, last_name, city)
      `)
      .gte("expiration_date", today)
      .order("expiration_date", { ascending: true });

    // Get warranties expiring within 90 days
    const { data: expiringWarranties, error: expiringError } = await supabase
      .from("warranties")
      .select(`
        id,
        expiration_date,
        job:jobs(id, title),
        homeowner:leads(id, first_name, last_name, city)
      `)
      .gte("expiration_date", today)
      .lte("expiration_date", ninetyDaysStr)
      .order("expiration_date", { ascending: true });

    // Get inspections due this month
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    const lastOfMonth = new Date();
    lastOfMonth.setMonth(lastOfMonth.getMonth() + 1);
    lastOfMonth.setDate(0);

    const { data: inspectionsDue, error: inspectionsError } = await supabase
      .from("warranty_inspections")
      .select(`
        id,
        due_date,
        completed,
        warranty:warranties!inner(
          id,
          job:jobs(id, title),
          homeowner:leads(id, first_name, last_name, city)
        )
      `)
      .eq("completed", false)
      .gte("due_date", firstOfMonth.toISOString().split("T")[0])
      .lte("due_date", lastOfMonth.toISOString().split("T")[0])
      .order("due_date", { ascending: true });

    // Get open warranty claims
    const { data: openClaims, error: claimsError } = await supabase
      .from("warranty_claims")
      .select(`
        id,
        issue,
        status,
        created_at,
        warranty:warranties!inner(
          id,
          job:jobs(id, title),
          homeowner:leads(id, first_name, last_name, city)
        )
      `)
      .eq("status", "open")
      .order("created_at", { ascending: false });

    // Get scheduled service visits
    const { data: scheduledVisits, error: visitsError } = await supabase
      .from("service_visits")
      .select(`
        id,
        scheduled_for,
        technician,
        completed,
        warranty:warranties!inner(
          id,
          job:jobs(id, title),
          homeowner:leads(id, first_name, last_name, city)
        )
      `)
      .eq("completed", false)
      .not("scheduled_for", "is", null)
      .order("scheduled_for", { ascending: true });

    // Calculate totals
    const totalActive = activeWarranties?.length || 0;
    const totalExpiring = expiringWarranties?.length || 0;
    const totalInspectionsDue = inspectionsDue?.length || 0;
    const totalOpenClaims = openClaims?.length || 0;
    const totalScheduledVisits = scheduledVisits?.length || 0;

    if (activeError || expiringError || inspectionsError || claimsError || visitsError) {
      console.error("Error fetching warranty dashboard data:", {
        activeError,
        expiringError,
        inspectionsError,
        claimsError,
        visitsError,
      });
    }

    return NextResponse.json({
      active_warranties: activeWarranties || [],
      expiring_warranties: expiringWarranties || [],
      inspections_due: inspectionsDue || [],
      open_claims: openClaims || [],
      scheduled_visits: scheduledVisits || [],
      totals: {
        active: totalActive,
        expiring: totalExpiring,
        inspections_due: totalInspectionsDue,
        open_claims: totalOpenClaims,
        scheduled_visits: totalScheduledVisits,
      },
    });
  } catch (error: any) {
    console.error("Error in warranty dashboard GET:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
