// app/api/contacts/query/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type Filter = {
  q?: string;
  domains?: string[];
  companies?: string[];
  has_name?: boolean;
  created_from?: string; // ISO date
  created_to?: string;   // ISO date
  limit?: number;
  offset?: number;
};

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { filter?: Filter } | null;
  const f: Filter = body?.filter || {};
  const limit = Math.min(200, Math.max(1, f.limit || 50));
  const offset = Math.max(0, f.offset || 0);

  // Load suppression emails to exclude
  const { data: suppressed } = await supabase
    .from("suppression_list")
    .select("email")
    .eq("user_id", auth.user.id);

  const suppressedSet = new Set((suppressed || []).map((r) => String(r.email).toLowerCase()));

  // Build base query
  let q = supabase
    .from("contacts")
    .select("id,email,first_name,last_name,company,domain,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (f.q && f.q.trim()) {
    const s = f.q.trim();
    q = q.or(
      [
        `email.ilike.%${s}%`,
        `first_name.ilike.%${s}%`,
        `last_name.ilike.%${s}%`,
        `company.ilike.%${s}%`,
        `domain.ilike.%${s}%`,
      ].join(",")
    );
  }
  if (f.domains?.length) {
    const list = f.domains.map((d) => d.toLowerCase());
    q = q.in("domain", list);
  }
  if (f.companies?.length) {
    q = q.in("company", f.companies);
  }
  if (f.has_name) {
    q = q.or("not.first_name.is.null,not.last_name.is.null");
  }
  if (f.created_from) q = q.gte("created_at", f.created_from);
  if (f.created_to)   q = q.lte("created_at", f.created_to);
  // Block 15300: Lead source filter
  if ((f as any).lead_source) {
    q = q.eq("lead_source", (f as any).lead_source);
  }

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Exclude suppressed (final guard)
  const rows = (data || []).filter((r) => !suppressedSet.has(String(r.email).toLowerCase()));

  return NextResponse.json({
    ok: true,
    total: count ?? rows.length,   // count before suppression; UI will show rows.length for preview
    returned: rows.length,
    items: rows,
  });
} 