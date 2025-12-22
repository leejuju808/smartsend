// Block 89000 — Auto-Generate Material List from Template
// POST /api/materials/generate
// Takes job_id, template_id, total_squares, waste_factor → generates material order

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, template_id, total_squares, waste_factor } = body;

    if (!job_id || !template_id || !total_squares) {
      return NextResponse.json(
        { error: "job_id, template_id, and total_squares are required" },
        { status: 400 }
      );
    }

    // Verify job access
    const { data: job } = await supabase
      .from("jobs")
      .select("id, team_id")
      .eq("id", job_id)
      .single();

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user is member of team
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", job.team_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Call database function to generate material list
    const { data: orderId, error: generateError } = await supabase.rpc(
      "generate_material_list_from_template",
      {
        p_job_id: job_id,
        p_template_id: template_id,
        p_total_squares: parseFloat(total_squares.toString()),
        p_waste_factor: waste_factor ? parseFloat(waste_factor.toString()) : null,
      }
    );

    if (generateError) {
      console.error("Error generating material list:", generateError);
      return NextResponse.json(
        { error: "Failed to generate material list" },
        { status: 500 }
      );
    }

    // Fetch the generated order with items
    const { data: order, error: orderError } = await supabase
      .from("material_orders")
      .select(`
        *,
        material_order_items (
          id,
          item_name,
          quantity,
          unit,
          cost_per_unit,
          total_cost
        )
      `)
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      console.error("Error fetching generated order:", orderError);
      return NextResponse.json(
        { error: "Failed to fetch generated order" },
        { status: 500 }
      );
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error("Error in POST /api/materials/generate:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



























