import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    throw new Error("Supabase credentials are not configured");
  }

  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });
}

export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("reply_rules")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json();
    if (!payload?.id) {
      return NextResponse.json(
        { error: "Missing rule id" },
        { status: 400 },
      );
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("reply_rules")
      .update({
        scope: payload.scope,
        campaign_id: payload.campaign_id ?? null,
        label: payload.label,
        kind: payload.kind,
        pattern: payload.pattern,
        weight: payload.weight,
        is_active: payload.is_active,
      })
      .eq("id", payload.id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


