import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { resolveAccountContext } from "@/app/api/dupes/_helpers";

type RoutingPayload = {
  vendor_key: string;
  weight?: number;
  priority?: number;
  enabled?: boolean;
};

export async function GET() {
  const supabase = createClient();
  const context = await resolveAccountContext(supabase);

  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const [{ data: vendors, error: vendorsError }, { data: routes, error: routesError }] =
    await Promise.all([
      supabase.from("vendor_registry").select("*").order("default_priority", { ascending: true }),
      supabase
        .from("account_vendor_routing")
        .select("*")
        .eq("account_id", context.accountId),
    ]);

  if (vendorsError) {
    return NextResponse.json({ error: vendorsError.message }, { status: 400 });
  }

  if (routesError) {
    return NextResponse.json({ error: routesError.message }, { status: 400 });
  }

  return NextResponse.json({
    vendors: vendors ?? [],
    routes: routes ?? [],
  });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const context = await resolveAccountContext(supabase);

  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  let body: RoutingPayload[];
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be an array of routing entries" }, { status: 400 });
  }

  const rows = body
    .filter((entry) => typeof entry?.vendor_key === "string" && entry.vendor_key.length > 0)
    .map((entry) => ({
      account_id: context.accountId,
      vendor_key: entry.vendor_key,
      weight: typeof entry.weight === "number" ? entry.weight : 100,
      priority: typeof entry.priority === "number" ? entry.priority : 100,
      enabled: entry.enabled ?? true,
    }));

  if (!rows.length) {
    return NextResponse.json({ error: "No valid routing entries provided" }, { status: 400 });
  }

  const { error } = await supabase
    .from("account_vendor_routing")
    .upsert(rows, { onConflict: "account_id,vendor_key" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

