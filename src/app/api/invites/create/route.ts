// app/api/invites/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  const { workspaceId, email, role } = await req.json();
  if (!workspaceId || !email || !role) return new NextResponse("Missing fields", { status: 400 });

  const token = randomBytes(24).toString("base64url");
  const supabase = getServerSupabase();

  // Check caller is owner/admin of workspace
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: me } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!me || (me.role !== "owner" && me.role !== "admin")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { error } = await supabase.from("workspace_invites").insert({
    workspace_id: workspaceId, email, role, token
  });
  if (error) return new NextResponse(error.message, { status: 500 });

  // TODO: send email with link `${process.env.NEXT_PUBLIC_APP_URL}/invite/accept?token=${token}`
  return NextResponse.json({ token });
}
