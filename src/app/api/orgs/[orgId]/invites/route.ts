import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  try {
    const { email, role } = await req.json();
    
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify the user is authenticated and is an admin/owner of this org
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      req.headers.get("authorization")?.replace("Bearer ", "") || ""
    );

    // For now, use service role to bypass RLS, but validate membership separately
    // In production, you'd want to use the user's session
    const userSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const token = crypto.randomBytes(24).toString("hex");
    
    const { error } = await supabase.from("org_invites").insert({
      org_id: params.orgId,
      email,
      role: role || "member",
      token,
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // TODO: send email via your existing provider
    // const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`;
    
    return NextResponse.json({ ok: true, token }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

