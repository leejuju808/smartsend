import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getActiveOrgId } from "@/lib/org";

export async function GET() {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org_id = getActiveOrgId();
    if (!org_id) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("org_send_settings")
      .select("*")
      .eq("org_id", org_id)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || null);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org_id = getActiveOrgId();
    if (!org_id) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }

    // Upsert settings
    const { data, error } = await supabase
      .from("org_send_settings")
      .upsert({ org_id, ...body }, { onConflict: "org_id" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

