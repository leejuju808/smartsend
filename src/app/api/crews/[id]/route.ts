// Block 34044 — Crew Management API (Single Crew)
// GET: Get crew details
// PUT: Update crew
// DELETE: Deactivate crew

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: crew, error } = await supabase
      .from("crews")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !crew) {
      return NextResponse.json(
        { error: "Crew not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ crew });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      leader_phone,
      foreman_name,
      foreman_phone,
      skills,
      max_jobs_per_day,
      typical_install_speed,
      notes,
      is_active,
    } = body;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (leader_phone !== undefined) updates.leader_phone = leader_phone;
    if (foreman_name !== undefined) updates.foreman_name = foreman_name;
    if (foreman_phone !== undefined) updates.foreman_phone = foreman_phone;
    if (skills !== undefined) updates.skills = Array.isArray(skills) ? skills : [];
    if (max_jobs_per_day !== undefined) updates.max_jobs_per_day = max_jobs_per_day;
    if (typical_install_speed !== undefined) updates.typical_install_speed = typical_install_speed;
    if (notes !== undefined) updates.notes = notes;
    if (is_active !== undefined) updates.is_active = is_active;

    updates.updated_at = new Date().toISOString();

    const { data: crew, error } = await supabase
      .from("crews")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ crew });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Soft delete: set is_active = false
    const { data: crew, error } = await supabase
      .from("crews")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ crew, message: "Crew deactivated" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

































