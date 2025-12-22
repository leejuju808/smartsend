import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      org_id,
      name,
      description,
      tone,
      formality,
      email_length,
      region,
      avoid_phrases,
      signature_hint,
    } = body;

    if (!org_id || !name || !description) {
      return NextResponse.json(
        { error: "org_id, name, and description are required" },
        { status: 400 },
      );
    }

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is a member of the org
    const { data: membership, error: membershipError } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 },
      );
    }

    // Only admins, members, and owners can create personas
    if (!["admin", "member", "owner"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from("sdr_personas")
      .insert({
        org_id,
        name,
        description,
        tone,
        formality,
        email_length,
        region,
        avoid_phrases: avoid_phrases ?? [],
        signature_hint,
        is_default: false,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "insert_failed", details: error },
        { status: 500 },
      );
    }

    return NextResponse.json({ persona: data });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "unexpected", details: String(err) },
      { status: 500 },
    );
  }
}

