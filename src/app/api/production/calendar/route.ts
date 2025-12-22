// Block 224000 — SmartSend Roofing Production Calendar API
// GET /api/production/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&crew_id=uuid
// Returns production calendar entries with job and crew details from job_schedule table

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

    // Get user's workspaces
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ calendar: [] });
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Parse query parameters
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const crew_id = url.searchParams.get("crew_id");

    // Build query using job_schedule table (Block 224000)
    let query = supabase
      .from("job_schedule")
      .select(`
        id,
        job_id,
        crew_id,
        scheduled_date,
        status,
        notes,
        created_at,
        updated_at,
        job:roofing_jobs(
          id,
          title,
          job_value,
          estimated_squares,
          official_squares,
          lead_id,
          status,
          address,
          homeowner_name,
          homeowner_phone,
          homeowner_email,
          job_type,
          deposit_paid,
          deposit_required,
          payment_status
        ),
        crew:crews(
          id,
          name,
          lead_name,
          lead_phone,
          active
        )
      `)
      .in("workspace_id", workspaceIds)
      .neq("status", "canceled")
      .order("scheduled_date", { ascending: true });

    // Apply date filters
    if (from) {
      query = query.gte("scheduled_date", from);
    }
    if (to) {
      query = query.lte("scheduled_date", to);
    }

    // Apply crew filter
    if (crew_id) {
      query = query.eq("crew_id", crew_id);
    }

    const { data: schedules, error } = await query;

    if (error) {
      console.error("Error fetching production calendar:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch calendar" },
        { status: 500 }
      );
    }

    // Get material orders for jobs to show readiness
    const jobIds = schedules?.map((s) => s.job_id).filter(Boolean) || [];
    let materialOrders: any[] = [];
    if (jobIds.length > 0) {
      const { data: orders } = await supabase
        .from("material_orders")
        .select("job_id, status, delivery_date, expected_delivery_date")
        .in("job_id", jobIds);
      materialOrders = orders || [];
    }

    // Get job readiness for each schedule
    const calendar = await Promise.all(
      (schedules || []).map(async (schedule) => {
        const materials = materialOrders.filter((o) => o.job_id === schedule.job_id);
        const materialsDelivered = materials.some((m) => m.status === "delivered");
        const materialsConfirmed = materials.some((m) =>
          ["delivered", "confirmed", "scheduled_for_delivery"].includes(m.status)
        );

        // Check job readiness
        let readiness: any = null;
        if (schedule.job_id) {
          const { data: readinessData } = await supabase.rpc("check_job_readiness", {
            p_job_id: schedule.job_id,
          });
          readiness = readinessData?.[0] || null;
        }

        return {
          id: schedule.id,
          job_id: schedule.job_id,
          crew_id: schedule.crew_id,
          scheduled_date: schedule.scheduled_date,
          status: schedule.status,
          notes: schedule.notes,
          created_at: schedule.created_at,
          updated_at: schedule.updated_at,
          job: schedule.job
            ? {
                ...schedule.job,
                materials_delivered: materialsDelivered,
                materials_confirmed: materialsConfirmed,
                material_delivery_date:
                  materials.find((m) => m.delivery_date)?.delivery_date ||
                  materials.find((m) => m.expected_delivery_date)?.expected_delivery_date,
              }
            : null,
          crew: schedule.crew,
          readiness: readiness
            ? {
                is_ready: readiness.is_ready,
                materials_status: readiness.materials_status,
                deposit_status: readiness.deposit_status,
              }
            : null,
        };
      })
    );

    return NextResponse.json({
      calendar: calendar || [],
      count: calendar?.length || 0,
    });
  } catch (error: any) {
    console.error("Production calendar API error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}







