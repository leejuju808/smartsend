import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { resolveAccountContext } from "@/app/api/dupes/_helpers";

type SecretPayload = {
  vendor_key?: string;
  kv?: Record<string, string>;
  name?: string;
};

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const context = await resolveAccountContext(supabase);

  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  let body: SecretPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.vendor_key || typeof body.vendor_key !== "string") {
    return NextResponse.json({ error: "vendor_key is required" }, { status: 400 });
  }

  if (!body.kv || typeof body.kv !== "object") {
    return NextResponse.json({ error: "kv is required" }, { status: 400 });
  }

  const payload = {
    account_id: context.accountId,
    vendor_key: body.vendor_key,
    name: body.name && typeof body.name === "string" ? body.name : "default",
    kv: body.kv,
  };

  const { error } = await supabase
    .from("vendor_secrets")
    .upsert(payload, { onConflict: "account_id,vendor_key,name" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

