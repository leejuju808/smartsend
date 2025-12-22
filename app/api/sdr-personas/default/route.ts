import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { org_id, persona_id } = body;

    if (!org_id || !persona_id) {
      return NextResponse.json(
        { error: "org_id and persona_id are required" },
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

    // Only admins, members, and owners can set default persona
    if (!["admin", "member", "owner"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    // Verify persona belongs to org
    const { data: persona, error: personaError } = await supabase
      .from("sdr_personas")
      .select("org_id")
      .eq("id", persona_id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (personaError || !persona) {
      return NextResponse.json(
        { error: "Persona not found or does not belong to this org" },
        { status: 404 },
      );
    }

    // Update sdr_settings.default_persona_id
    const { error: settingsError } = await supabase
      .from("sdr_settings")
      .upsert(
        {
          org_id,
          default_persona_id: persona_id,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "org_id",
        },
      );

    if (settingsError) {
      return NextResponse.json(
        { error: "settings_update_failed", details: settingsError },
        { status: 500 },
      );
    }

    // Optional: update sdr_personas.is_default flags
    await supabase
      .from("sdr_personas")
      .update({ is_default: false })
      .eq("org_id", org_id);

    await supabase
      .from("sdr_personas")
      .update({ is_default: true })
      .eq("id", persona_id);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "unexpected", details: String(err) },
      { status: 500 },
    );
  }
}

