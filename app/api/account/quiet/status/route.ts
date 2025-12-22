import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin env vars missing");
  }
  return createClient(url, key);
}

const ISP_DOMAINS: Record<string, string[]> = {
  gmail: ["gmail.com", "googlemail.com"],
  outlook: ["outlook.com", "hotmail.com", "live.com", "msn.com", "office365.com"],
  yahoo: ["yahoo.com", "ymail.com", "aol.com"],
  zoho: ["zoho.com"],
};

function inferIsp(domain: string | null | undefined): string {
  if (!domain) return "other";
  const d = domain.toLowerCase();
  for (const [isp, patterns] of Object.entries(ISP_DOMAINS)) {
    if (patterns.some((p) => d.endsWith(p))) {
      return isp;
    }
  }
  return "other";
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const accountId: string | undefined = body?.account_id;
  const providedIsp: string | undefined = body?.isp_key;
  const email: string | undefined = body?.to_email;
  const domain: string | undefined = body?.domain ?? email?.split("@")?.[1];

  if (!accountId) {
    return NextResponse.json({ ok: false, error: "account_id required" }, { status: 400 });
  }

  const supa = serviceClient();

  let ispKey = (providedIsp ?? "").toLowerCase();
  if (!["gmail", "outlook", "yahoo", "zoho", "other"].includes(ispKey)) {
    ispKey = inferIsp(domain);
    if (domain) {
      try {
        const { data } = await supa
          .from("mx_cache")
          .select("isp_key")
          .eq("domain", domain.toLowerCase())
          .maybeSingle();
        if (data?.isp_key && ["gmail", "outlook", "yahoo", "zoho", "other"].includes(data.isp_key)) {
          ispKey = data.isp_key;
        }
      } catch {
        // ignore cache lookup errors; fall back to inferred key
      }
    }
  }

  const { data, error } = await supa.rpc("is_quiet_for_isp", {
    p_account_id: accountId,
    p_isp_key: ispKey || "other",
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    quiet: data === true,
    isp_key: ispKey || "other",
  });
}

