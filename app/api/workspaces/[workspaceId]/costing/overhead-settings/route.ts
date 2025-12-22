// Block 255700 — SmartSend Job Costing & Profit Engine v1
// API Route: Overhead allocation settings
// GET /api/workspaces/[workspaceId]/costing/overhead-settings - Get settings
// POST /api/workspaces/[workspaceId]/costing/overhead-settings - Update settings

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET overhead allocation settings
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: settings, error } = await supabase
      .from("overhead_allocation_settings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching overhead settings:", error);
      return NextResponse.json(
        { error: "Failed to fetch overhead settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      settings: settings || {
        office_overhead: 0,
        vehicle_fuel: 0,
        insurance_allocation: 0,
        software_tools: 0,
        other_overhead: 0,
        allocation_method: "per_job",
      },
    });
  } catch (error: any) {
    console.error("Error in get overhead settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST update overhead allocation settings
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      office_overhead,
      vehicle_fuel,
      insurance_allocation,
      software_tools,
      other_overhead,
      allocation_method,
      allocation_percentage,
      allocation_per_square,
    } = body;

    // Upsert settings
    const { data: settings, error } = await supabase
      .from("overhead_allocation_settings")
      .upsert(
        {
          workspace_id: workspaceId,
          office_overhead: office_overhead || 0,
          vehicle_fuel: vehicle_fuel || 0,
          insurance_allocation: insurance_allocation || 0,
          software_tools: software_tools || 0,
          other_overhead: other_overhead || 0,
          allocation_method: allocation_method || "per_job",
          allocation_percentage: allocation_percentage || null,
          allocation_per_square: allocation_per_square || null,
        },
        {
          onConflict: "workspace_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error updating overhead settings:", error);
      return NextResponse.json(
        { error: "Failed to update overhead settings", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ settings });
  } catch (error: any) {
    console.error("Error in update overhead settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















