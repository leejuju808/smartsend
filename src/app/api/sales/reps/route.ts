// Block 254300 — SmartSend Sales Acceleration Engine v1
// Sales Reps Management API
// GET /api/sales/reps?org_id=xxx
// POST /api/sales/reps

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const org_id = searchParams.get("org_id");

    if (!org_id) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }

    const { data: reps, error } = await supabase
      .from("sales_reps")
      .select("*")
      .eq("org_id", org_id)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching sales reps:", error);
      return NextResponse.json(
        { error: "Failed to fetch sales reps" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      reps: reps || [],
    });
  } catch (error: any) {
    console.error("Error in sales reps API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { org_id, name, phone, email } = body;

    if (!org_id || !name) {
      return NextResponse.json(
        { error: "org_id and name required" },
        { status: 400 }
      );
    }

    const { data: rep, error } = await supabase
      .from("sales_reps")
      .insert({
        org_id,
        name,
        phone: phone || null,
        email: email || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating sales rep:", error);
      return NextResponse.json(
        { error: "Failed to create sales rep" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      rep,
    });
  } catch (error: any) {
    console.error("Error in sales reps API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















