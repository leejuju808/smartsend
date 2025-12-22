// Block 22400 — SmartSend Roofing Permit & HOA Management v1
// API Route: Permit & HOA Dashboard
// GET /api/dashboard/permits

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspaces
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({
        riskyJobs: [],
        expiringPermits: [],
      });
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Jobs with required permit or HOA and not approved
    const { data: riskyJobs, error: riskyErr } = await supabase
      .from("roofing_jobs")
      .select(
        `
        id,
        title,
        status,
        scheduled_start_date,
        permit_required,
        permit_status,
        hoa_required,
        hoa_status,
        lead:leads(first_name, last_name, city)
      `
      )
      .in("workspace_id", workspaceIds)
      .or(
        `and(permit_required.eq.true,permit_status.neq.approved),and(hoa_required.eq.true,hoa_status.neq.approved)`
      )
      .order("scheduled_start_date", { ascending: true });

    if (riskyErr) {
      console.error(riskyErr);
      return NextResponse.json(
        { error: riskyErr.message },
        { status: 500 }
      );
    }

    // Permits expiring soon (within 30 days)
    const today = new Date();
    const soon = new Date();
    soon.setDate(today.getDate() + 30);
    const todayStr = today.toISOString().slice(0, 10);
    const soonStr = soon.toISOString().slice(0, 10);

    const { data: expiringPermits, error: expErr } = await supabase
      .from("job_permits")
      .select(
        `
        id,
        job_id,
        permit_type,
        jurisdiction,
        permit_number,
        expiration_date,
        job:roofing_jobs(title, lead:leads(first_name, last_name, city))
      `
      )
      .in("workspace_id", workspaceIds)
      .gte("expiration_date", todayStr)
      .lte("expiration_date", soonStr)
      .order("expiration_date", { ascending: true });

    if (expErr) {
      console.error(expErr);
      return NextResponse.json(
        { error: expErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        riskyJobs: riskyJobs || [],
        expiringPermits: expiringPermits || [],
      },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in permits dashboard:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































