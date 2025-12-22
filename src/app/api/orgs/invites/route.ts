import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getActiveOrg } from "@/lib/org";

export async function GET() {
  const sb = createSupabaseServer();
  const org = await getActiveOrg();
  if (!org) return NextResponse.json({ error: "No org" }, { status: 400 });

  const { data } = await sb.from("org_invites").select("id,email,role,accepted,created_at").eq("org_id", org.id).order("created_at", { ascending: false });
  return NextResponse.json({ invites: data ?? [] });
}

export async function POST(req: Request) {
  const { email, role } = await req.json();
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const org = await getActiveOrg();
  if (!user || !org) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // only owner/manager can invite
  if (!["owner","manager"].includes(org.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Validate role
  const validRole = role ?? "member";
  if (!["manager", "member"].includes(validRole)) {
    return NextResponse.json({ error: "Invalid role. Must be 'manager' or 'member'" }, { status: 400 });
  }

  const token = randomBytes(24).toString("hex");
  const { error } = await sb.from("org_invites").insert({
    org_id: org.id,
    email: String(email).toLowerCase().trim(),
    role: validRole,
    token,
    invited_by: user.id
  });
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // TODO: send email w/ link `${process.env.NEXT_PUBLIC_APP_URL}/org/join?t=${token}`
  const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL}/org/join?t=${token}`;
  console.log(`Invite link: ${inviteLink}`);
  
  return NextResponse.json({ ok: true, token, inviteLink });
}