import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

async function checkAdminAccess(supabase: any, workspaceId: string, userId: string): Promise<boolean> {
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  return membership && (membership.role === 'owner' || membership.role === 'admin');
}

// GET /api/settings/sending-windows - Get workspace sending window settings
export async function GET() {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace_id = await getCurrentWorkspaceId();
    if (!workspace_id) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("workspace_sending_windows")
      .select("*")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return defaults if no window configured
    if (!data) {
      return NextResponse.json({
        workspace_id,
        timezone: 'America/Los_Angeles',
        allowed_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        start_time: '08:00',
        end_time: '17:00',
      });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/settings/sending-windows - Update workspace sending window settings
export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace_id = await getCurrentWorkspaceId();
    if (!workspace_id) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    // Check admin access
    const isAdmin = await checkAdminAccess(supabase, workspace_id, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: "Only Owners/Admins can edit settings" }, { status: 403 });
    }

    const body = await req.json();
    const { timezone, allowed_days, start_time, end_time } = body;

    // Validate inputs
    if (!timezone || !allowed_days || !start_time || !end_time) {
      return NextResponse.json(
        { error: "timezone, allowed_days, start_time, and end_time are required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(allowed_days) || allowed_days.length === 0) {
      return NextResponse.json(
        { error: "allowed_days must be a non-empty array" },
        { status: 400 }
      );
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
      return NextResponse.json(
        { error: "start_time and end_time must be in HH:MM format" },
        { status: 400 }
      );
    }

    // Upsert workspace sending window
    const { data, error } = await supabase
      .from("workspace_sending_windows")
      .upsert({
        workspace_id,
        timezone,
        allowed_days,
        start_time,
        end_time,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'workspace_id'
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



