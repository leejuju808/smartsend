import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const userId = body.userId;
    const role = body.role || "member";

    if (!userId) {
      return NextResponse.json({ error: "user_required" }, { status: 400 });
    }

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return NextResponse.json({ error: "not_auth" }, { status: 401 });
    }

    // Get user's workspace membership
    const { data: membership } = await supabase
      .from("team_members")
      .select("workspace_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership) {
      // Fallback: check workspaces table
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_id", user.id)
        .single();

      if (!workspace) {
        return NextResponse.json({ error: "no_workspace" }, { status: 400 });
      }

      // Check seat caps
      const { data: limits } = await supabaseAdmin
        .from("workspace_billing_limits")
        .select("seats_allowed")
        .eq("workspace_id", workspace.id)
        .maybeSingle();

      const seatsAllowed = limits?.seats_allowed ?? 1;

      const { count: currentSeats } = await supabaseAdmin
        .from("team_members")
        .select("id", { head: true, count: "exact" })
        .eq("workspace_id", workspace.id)
        .eq("status", "active");

      if (currentSeats !== null && currentSeats >= seatsAllowed) {
        return NextResponse.json(
          {
            error: "seat_limit_reached",
            message: "Seat limit reached. Upgrade plan to add more people.",
            seats_allowed: seatsAllowed,
            seats_used: currentSeats,
          },
          { status: 403 }
        );
      }

      // Add member
      const { error } = await supabaseAdmin.from("team_members").insert({
        workspace_id: workspace.id,
        user_id: userId,
        role,
        status: "active",
      });

      if (error) {
        console.error(error);
        return NextResponse.json({ error: "insert_failed" }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    if (membership.role !== "owner" && membership.role !== "admin") {
      return NextResponse.json({ error: "not_allowed" }, { status: 403 });
    }

    const workspaceId = membership.workspace_id;

    // Check seat caps
    const { data: limits } = await supabaseAdmin
      .from("workspace_billing_limits")
      .select("seats_allowed")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const seatsAllowed = limits?.seats_allowed ?? 1;

    const { count: currentSeats } = await supabaseAdmin
      .from("team_members")
      .select("id", { head: true, count: "exact" })
      .eq("workspace_id", workspaceId)
      .eq("status", "active");

    if (currentSeats !== null && currentSeats >= seatsAllowed) {
      return NextResponse.json(
        {
          error: "seat_limit_reached",
          message: "Seat limit reached. Upgrade plan to add more people.",
          seats_allowed: seatsAllowed,
          seats_used: currentSeats,
        },
        { status: 403 }
      );
    }

    // Add member
    const { error } = await supabaseAdmin.from("team_members").insert({
      workspace_id: workspaceId,
      user_id: userId,
      role,
      status: "active",
    });

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "insert_failed" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error adding team member:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






