import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  try {
    const { orgId, inviterId, email, role } = await req.json();
    if (!orgId || !inviterId || !email) return NextResponse.json({ error: "orgId, inviterId, email required" }, { status: 400 });

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 1000*60*60*24*7).toISOString();

    const sb = createClient(url, service, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from("org_invites")
      .insert({ org_id: orgId, email, role: role ?? "member", token, expires_at: expiresAt, created_by: inviterId })
      .select("id,token,expires_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ token, expiresAt });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


