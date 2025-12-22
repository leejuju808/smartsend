import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!(email && list.includes(email.toLowerCase()));
}

type Flow = "send" | "payment";

function withinHours(iso: string | null | undefined, hours: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= hours * 60 * 60 * 1000;
}

async function loadFlowStatus(admin: any, flow: Flow) {
  const action = flow === "send" ? "release_gate_send_flow" : "release_gate_payment_flow";
  const { data, error } = await admin
    .from("audit_logs")
    .select("created_at, meta")
    .eq("action", action)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { verified: false, ok: false, at: null as string | null, reason: error.message };
  const ok = !!(data as any)?.meta?.ok;
  const at = (data as any)?.created_at ?? null;
  const verified = ok && withinHours(at, 24);
  const reason = (data as any)?.meta?.reason ?? null;
  return { verified, ok, at, reason };
}

async function computeGate(admin: any) {
  const [{ count: criticalOpen }, { count: highOpen }] = await Promise.all([
    admin
      .from("bug_reports")
      .select("id", { count: "exact", head: true })
      .eq("severity", "critical")
      .in("status", ["open", "in_progress", "fixed"]),
    admin
      .from("bug_reports")
      .select("id", { count: "exact", head: true })
      .eq("severity", "high")
      .in("status", ["open", "in_progress", "fixed"]),
  ]);

  const sendFlow = await loadFlowStatus(admin, "send");
  const paymentFlow = await loadFlowStatus(admin, "payment");

  const critical = criticalOpen ?? 0;
  const high = highOpen ?? 0;

  const ok = critical === 0 && high <= 3 && sendFlow.verified && paymentFlow.verified;

  return {
    ok,
    counts: { critical, high },
    flows: { send: sendFlow, payment: paymentFlow },
  };
}

async function runFlowCheck(admin: any, flow: Flow) {
  // Best-effort, non-destructive verification. We verify the “surface” exists and is readable.
  let ok = false;
  let reason = "unknown";

  try {
    if (flow === "send") {
      const { error } = await admin.from("delivery_logs").select("id").limit(1);
      ok = !error;
      reason = ok ? "delivery_logs_read_ok" : `delivery_logs_read_failed:${error?.message || "unknown"}`;
    } else {
      const { error } = await admin.from("company_subscriptions").select("id").limit(1);
      ok = !error;
      reason = ok ? "company_subscriptions_read_ok" : `company_subscriptions_read_failed:${error?.message || "unknown"}`;
    }
  } catch (e: any) {
    ok = false;
    reason = `exception:${e?.message || String(e)}`;
  }

  const action = flow === "send" ? "release_gate_send_flow" : "release_gate_payment_flow";

  await admin.from("audit_logs").insert({
    action,
    action_type: "release_gate_flow_check",
    entity: "release_gate",
    meta: { flow, ok, reason },
  });

  return { ok, reason };
}

export async function GET() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = supabaseAdmin();
  const gate = await computeGate(admin);
  return NextResponse.json(gate);
}

export async function POST(req: NextRequest) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const flow = String(body?.flow || "").toLowerCase();
  if (flow !== "send" && flow !== "payment") {
    return NextResponse.json({ error: "Invalid flow" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const res = await runFlowCheck(admin, flow as Flow);
  const gate = await computeGate(admin);

  return NextResponse.json({ flow: { name: flow, ...res }, gate });
}









