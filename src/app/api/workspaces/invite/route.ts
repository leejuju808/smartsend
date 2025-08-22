import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canManageMembers } from "@/utils/permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { workspaceId, email, role } = await req.json() as { workspaceId: string; email: string; role?: string };
    if (!workspaceId || !email) {
      return NextResponse.json({ error: "workspaceId and email are required" }, { status: 400 });
    }

    // Authenticate caller via Supabase access token (App Router context)
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const { data: authedUser } = await supabase.auth.getUser(token);
    const callerId = (authedUser?.user as any)?.id as string | undefined;
    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check caller membership role for this workspace
    const { data: callerMembership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", callerId)
      .maybeSingle();
    const callerRole = (callerMembership as any)?.role as string | undefined;
    if (!callerRole || !canManageMembers(callerRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const desiredRole = (role || "member") as string;
    if (!["owner", "admin", "member"].includes(desiredRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Enforce seat limit before inviting
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id, seat_limit, member_count")
      .eq("id", workspaceId)
      .maybeSingle();
    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    if ((ws as any).member_count >= (ws as any).seat_limit) {
      return NextResponse.json({ error: "Seat limit reached. Upgrade your plan to add more members." }, { status: 403 });
    }

    // Find user by email in profiles
    const { data: user } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { error } = await supabase.from("workspace_members").insert([
      { workspace_id: workspaceId, user_id: (user as any).id, role: desiredRole },
    ]);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Increment member_count on success (best-effort)
    await supabase
      .from("workspaces")
      .update({ member_count: ((ws as any).member_count ?? 0) + 1 })
      .eq("id", workspaceId);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
} 