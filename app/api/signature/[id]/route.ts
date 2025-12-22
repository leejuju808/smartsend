import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase configuration for signature API");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabase
    .from("signature_facts")
    .select("*")
    .eq("message_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, fact: data ?? null });
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data: fact, error } = await supabase
    .from("signature_facts")
    .select("*")
    .eq("message_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  if (!fact) {
    return NextResponse.json({ ok: false, error: "signature fact not found" }, { status: 404 });
  }

  if (!fact.lead_id) {
    return NextResponse.json({ ok: false, error: "no linked lead for signature" }, { status: 422 });
  }

  const { error: enrichError } = await supabase.rpc("fn_apply_signature_enrichment", {
    p_account_id: fact.account_id,
    p_lead_id: fact.lead_id,
    p_name: fact.full_name,
    p_title: fact.title,
    p_company: fact.company,
    p_tz: fact.timezone,
    p_emails: fact.emails ?? [],
    p_phones: fact.phones ?? [],
    p_website: fact.website,
  } as any);

  if (enrichError) {
    return NextResponse.json({ ok: false, error: enrichError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

