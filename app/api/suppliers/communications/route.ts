// Block 24340 — Supplier Communication Engine
// API Route: Get Supplier Communications for a Job/Order
// GET /api/suppliers/communications?material_order_id=xxx

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

    const { searchParams } = new URL(req.url);
    const material_order_id = searchParams.get("material_order_id");
    const job_id = searchParams.get("job_id");

    if (!material_order_id && !job_id) {
      return NextResponse.json(
        { error: "Missing material_order_id or job_id" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("supplier_communications")
      .select(`
        *,
        suppliers (id, name, email),
        material_orders (id, po_number, status),
        roofing_jobs (id, title)
      `)
      .order("created_at", { ascending: false });

    if (material_order_id) {
      query = query.eq("material_order_id", material_order_id);
    }

    if (job_id) {
      query = query.eq("job_id", job_id);
    }

    const { data: communications, error } = await query;

    if (error) {
      console.error("Error fetching communications:", error);
      return NextResponse.json(
        { error: "Failed to fetch communications" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      communications: communications || [],
    });
  } catch (error: any) {
    console.error("Error in get communications:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































